import {
  Path,
  Rect,
  Textbox,
  loadSVGFromString,
  type FabricObject,
} from "fabric";
import type { DocumentState, EditorNode } from "../../layers/data/types";
import {
  ensureNumber,
  readNormalizedTransformFromObject,
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

function createBaseNode(
  zIndex: number,
  name: string,
): Pick<
  EditorNode,
  "id" | "name" | "locked" | "hidden" | "zIndex" | "business"
> {
  return {
    id: crypto.randomUUID(),
    name,
    locked: false,
    hidden: false,
    zIndex,
    business: { type: "未标记" },
  };
}

function createPathNodeFromImportedShape(
  obj: FabricObject,
  zIndex: number,
  name: string,
  path: unknown,
): EditorNode | null {
  if (!path) return null;

  return {
    ...createBaseNode(zIndex, name),
    graphic: {
      fabricType: "path",
      props: {
        ...readNormalizedTransformFromObject(obj),
        path,
        stroke: asColor(obj.stroke, "#111827") ?? "#111827",
        strokeWidth: ensureNumber(obj.strokeWidth, 2),
        fill: asColor(obj.fill, null),
      },
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
  const importedNodes: EditorNode[] = [];

  for (const obj of parsedObjects) {
    if (!obj) continue;

    if (obj.type === "rect") {
      const rect = obj as Rect;
      const node: EditorNode = {
        ...createBaseNode(importedNodes.length, "导入矩形"),
        graphic: {
          fabricType: "rect",
          props: {
            ...readNormalizedTransformFromObject(rect),
            width: ensureNumber(rect.width, 100),
            height: ensureNumber(rect.height, 80),
            fill: asColor(rect.fill, "#ffffff") ?? "#ffffff",
            stroke: asColor(rect.stroke, "#111827") ?? "#111827",
            strokeWidth: ensureNumber(rect.strokeWidth, 2),
            rx: ensureNumber((rect as unknown as { rx?: number }).rx, 0),
            ry: ensureNumber((rect as unknown as { ry?: number }).ry, 0),
          },
        },
      };
      importedNodes.push(node);
      continue;
    }

    if (obj.type === "textbox" || obj.type === "text") {
      const textbox = obj as Textbox;
      const node: EditorNode = {
        ...createBaseNode(importedNodes.length, "导入文本"),
        graphic: {
          fabricType: "textbox",
          props: {
            ...readNormalizedTransformFromObject(textbox),
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
          },
        },
      };
      importedNodes.push(node);
      continue;
    }

    if (obj.type === "path") {
      const pathNode = createPathNodeFromImportedShape(
        obj,
        importedNodes.length,
        "导入路径",
        (obj as Path & { path?: unknown }).path ?? null,
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
      width: ensureNumber(options.width, baseState.canvas.width),
      height: ensureNumber(options.height, baseState.canvas.height),
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
