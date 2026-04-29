import {
  Path,
  Rect,
  Textbox,
  loadSVGFromString,
  type FabricObject,
} from "fabric";
import type { DocumentState, EditorNode } from "../../layers/data/types";
import {
  createNodeFromFabricObject,
  ensureNumber,
  serializeFabricObject,
} from "./fabricProjection";

type ImportedGroup = FabricObject & {
  getObjects?: () => FabricObject[];
};

function asColor(value: unknown, fallback: string | null) {
  return typeof value === "string" ? value : fallback;
}

function getImportedObjects(
  objects: Array<FabricObject | null>,
): FabricObject[] {
  const flattened: FabricObject[] = [];

  for (const obj of objects) {
    if (!obj) continue;

    const children = (obj as ImportedGroup).getObjects?.();
    if (children && children.length > 0) {
      flattened.push(...getImportedObjects(children));
      continue;
    }

    flattened.push(obj);
  }

  return flattened;
}

function createPathNodeFromImportedShape(
  obj: FabricObject,
  zIndex: number,
  name: string,
  path: unknown,
  offset: { dx: number; dy: number },
): EditorNode | null {
  if (!path) return null;

  const pathObj = new Path(
    path as never,
    {
      stroke: asColor(obj.stroke, "#111827") ?? "#111827",
      strokeWidth: ensureNumber(obj.strokeWidth, 2),
      fill: asColor(obj.fill, null),
      left: ensureNumber(obj.left, 0) + offset.dx,
      top: ensureNumber(obj.top, 0) + offset.dy,
      scaleX: ensureNumber(obj.scaleX, 1),
      scaleY: ensureNumber(obj.scaleY, 1),
      angle: ensureNumber(obj.angle, 0),
      opacity: ensureNumber(obj.opacity, 1),
      originX: "left",
      originY: "top",
    } as never,
  );

  return createNodeFromFabricObject(pathObj, zIndex, name);
}

type BoundingRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function tryGetBoundingRect(obj: FabricObject): BoundingRect | null {
  const fn = (obj as unknown as { getBoundingRect?: unknown }).getBoundingRect;
  if (typeof fn !== "function") return null;
  try {
    // absolute=true, calculate=true: get bbox in canvas coordinates including transforms.
    const rect = (
      obj as unknown as {
        getBoundingRect: (absolute?: boolean, calculate?: boolean) => unknown;
      }
    ).getBoundingRect(true, true) as Partial<BoundingRect>;
    const left = ensureNumber(rect.left, NaN);
    const top = ensureNumber(rect.top, NaN);
    const width = ensureNumber(rect.width, NaN);
    const height = ensureNumber(rect.height, NaN);
    if (![left, top, width, height].every((n) => Number.isFinite(n)))
      return null;
    return { left, top, width, height };
  } catch {
    return null;
  }
}

function computeImportOffsetAndCanvasSize(
  parsedObjects: FabricObject[],
  baseState: DocumentState,
  options: { width?: unknown; height?: unknown },
) {
  const padding = 20;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const obj of parsedObjects) {
    const rect = tryGetBoundingRect(obj);
    if (!rect) continue;
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.left + rect.width);
    maxY = Math.max(maxY, rect.top + rect.height);
  }

  const hasBounds =
    Number.isFinite(minX) &&
    Number.isFinite(minY) &&
    Number.isFinite(maxX) &&
    Number.isFinite(maxY) &&
    maxX > minX &&
    maxY > minY;

  const baseWidth = ensureNumber(options.width, baseState.canvas.width);
  const baseHeight = ensureNumber(options.height, baseState.canvas.height);

  if (!hasBounds) {
    return {
      dx: 0,
      dy: 0,
      canvas: {
        width: baseWidth,
        height: baseHeight,
      },
    };
  }

  // Shift so the top-left of the import bbox starts at `padding`.
  const dx = padding - minX;
  const dy = padding - minY;

  // Ensure canvas large enough to contain the shifted bbox with padding on both sides.
  const neededWidth = Math.ceil(maxX - minX + padding * 2);
  const neededHeight = Math.ceil(maxY - minY + padding * 2);

  return {
    dx,
    dy,
    canvas: {
      width: Math.max(baseWidth, neededWidth),
      height: Math.max(baseHeight, neededHeight),
    },
  };
}

function buildEllipsePath(width: number, height: number) {
  const rx = width / 2;
  const ry = height / 2;
  return `M ${rx} 0 A ${rx} ${ry} 0 1 0 ${rx} ${height} A ${rx} ${ry} 0 1 0 ${rx} 0 Z`;
}

function buildLinePath(
  line: FabricObject & { x1?: number; y1?: number; x2?: number; y2?: number },
) {
  const x1 = ensureNumber(line.x1, 0);
  const y1 = ensureNumber(line.y1, 0);
  const x2 = ensureNumber(line.x2, ensureNumber(line.width, 0));
  const y2 = ensureNumber(line.y2, ensureNumber(line.height, 0));
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function buildPointsPath(
  obj: FabricObject & { points?: Array<{ x?: number; y?: number }> },
  closePath: boolean,
) {
  if (!Array.isArray(obj.points) || obj.points.length === 0) return null;

  const [first, ...rest] = obj.points;
  const commands = [
    `M ${ensureNumber(first.x, 0)} ${ensureNumber(first.y, 0)}`,
  ];

  for (const point of rest) {
    commands.push(`L ${ensureNumber(point.x, 0)} ${ensureNumber(point.y, 0)}`);
  }

  if (closePath) commands.push("Z");
  return commands.join(" ");
}

export async function buildDocumentFromSvgImport(
  baseState: DocumentState,
  svg: string,
): Promise<DocumentState> {
  const { objects, options } = await loadSVGFromString(svg);
  if (!objects || objects.length === 0) {
    throw new Error("SVG 未解析到任何可导入图元（解析结果为空）。");
  }
  const parsedObjects = getImportedObjects(objects);
  if (parsedObjects.length === 0) {
    throw new Error(
      "SVG 未解析到任何可导入图元（可能只有空组或不支持的元素）。",
    );
  }

  // Many SVGs contain negative coordinates or large offsets (e.g. from viewBox/group transforms).
  // Normalize them so imported content is guaranteed to appear inside the canvas.
  const {
    dx,
    dy,
    canvas: importCanvas,
  } = computeImportOffsetAndCanvasSize(parsedObjects, baseState, options);
  const importedNodes: EditorNode[] = [];

  for (const obj of parsedObjects) {
    if (!obj) continue;

    if (obj.type === "rect") {
      const rect = obj as Rect;
      const node = createNodeFromFabricObject(
        rect,
        importedNodes.length,
        "导入矩形",
      );
      node.fabricObject = serializeFabricObject(rect, {
        left: ensureNumber(node.fabricObject.left, 0) + dx,
        top: ensureNumber(node.fabricObject.top, 0) + dy,
        width: ensureNumber(rect.width, 100),
        height: ensureNumber(rect.height, 80),
        fill: asColor(rect.fill, "#ffffff") ?? "#ffffff",
        stroke: asColor(rect.stroke, "#111827") ?? "#111827",
        strokeWidth: ensureNumber(rect.strokeWidth, 2),
        rx: ensureNumber((rect as unknown as { rx?: number }).rx, 0),
        ry: ensureNumber((rect as unknown as { ry?: number }).ry, 0),
      });
      importedNodes.push(node);
      continue;
    }

    if (obj.type === "textbox" || obj.type === "text") {
      const textbox = obj as Textbox;
      const node = createNodeFromFabricObject(
        textbox,
        importedNodes.length,
        "导入文本",
      );
      node.fabricObject = serializeFabricObject(textbox, {
        type: "textbox",
        left: ensureNumber(node.fabricObject.left, 0) + dx,
        top: ensureNumber(node.fabricObject.top, 0) + dy,
        text: typeof textbox.text === "string" ? textbox.text : "",
        fontFamily:
          typeof textbox.fontFamily === "string"
            ? textbox.fontFamily
            : "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: ensureNumber(textbox.fontSize, 24),
        fill: typeof textbox.fill === "string" ? textbox.fill : "#111827",
        lineHeight: ensureNumber(textbox.lineHeight, 1.2),
        textAlign:
          textbox.textAlign === "center" ||
          textbox.textAlign === "right" ||
          textbox.textAlign === "justify"
            ? textbox.textAlign
            : "left",
      });
      importedNodes.push(node);
      continue;
    }

    if (obj.type === "path") {
      const pathNode = createPathNodeFromImportedShape(
        obj,
        importedNodes.length,
        "导入路径",
        (obj as Path & { path?: unknown }).path ?? null,
        { dx, dy },
      );

      if (pathNode) importedNodes.push(pathNode);
      continue;
    }

    if (obj.type === "circle" || obj.type === "ellipse") {
      const width = ensureNumber(obj.width, 0);
      const height = ensureNumber(obj.height, width);
      const pathNode = createPathNodeFromImportedShape(
        obj,
        importedNodes.length,
        obj.type === "circle" ? "导入圆形" : "导入椭圆",
        buildEllipsePath(width, height),
        { dx, dy },
      );

      if (pathNode) importedNodes.push(pathNode);
      continue;
    }

    if (obj.type === "line") {
      const pathNode = createPathNodeFromImportedShape(
        obj,
        importedNodes.length,
        "导入线段",
        buildLinePath(
          obj as FabricObject & {
            x1?: number;
            y1?: number;
            x2?: number;
            y2?: number;
          },
        ),
        { dx, dy },
      );

      if (pathNode) importedNodes.push(pathNode);
      continue;
    }

    if (obj.type === "polyline" || obj.type === "polygon") {
      const pathNode = createPathNodeFromImportedShape(
        obj,
        importedNodes.length,
        obj.type === "polygon" ? "导入多边形" : "导入折线",
        buildPointsPath(
          obj as FabricObject & { points?: Array<{ x?: number; y?: number }> },
          obj.type === "polygon",
        ),
        { dx, dy },
      );

      if (pathNode) importedNodes.push(pathNode);
    }
  }

  if (parsedObjects.length > 0 && importedNodes.length === 0) {
    throw new Error(
      "SVG 已解析出图元，但当前导入器暂不支持这些元素类型，常见原因是文件主要由 group/path 以外的复杂结构组成。",
    );
  }

  return {
    ...baseState,
    canvas: {
      width: importCanvas.width,
      height: importCanvas.height,
      backgroundColor: "#ffffff",
    },
    svg,
    scene: {
      ...baseState.scene,
      nodes: Object.fromEntries(importedNodes.map((node) => [node.id, node])),
      order: importedNodes.map((node) => node.id),
    },
    meta: {
      ...baseState.meta,
      version: baseState.meta.version + 1,
      updatedAt: new Date().toISOString(),
    },
  };
}
