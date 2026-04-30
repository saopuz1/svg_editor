import { Ellipse, Path, Rect, Textbox, type FabricObject } from "fabric";
import type {
  DocumentState,
  EditorNode,
  NodeId,
  SerializedFabricObject,
} from "../../layers/data/types";
import { resolveNodeAnnotationStyle } from "../../layers/data/annotationStyles";
import { createDefaultBusinessForFabricType } from "../../layers/data/business";
import { createNodeIdForBusiness } from "../../layers/data/idRules";
import type { ViewState } from "../../layers/view/viewState";

export function ensureNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const NODE_ID_KEY = "__editorNodeId";

type ObjectWithCustom = FabricObject & Record<string, unknown>;
type MutableSerializedFabricObject = SerializedFabricObject &
  Record<string, unknown>;

export function setObjectNodeId(obj: FabricObject, nodeId: NodeId) {
  (obj as ObjectWithCustom)[NODE_ID_KEY] = nodeId;
}

export function getNodeIdFromObject(obj: FabricObject): NodeId | null {
  const nodeId = (obj as ObjectWithCustom)[NODE_ID_KEY];
  return typeof nodeId === "string" ? nodeId : null;
}

export function readTransformFromObject(obj: FabricObject) {
  return {
    left: ensureNumber(obj.left, 0),
    top: ensureNumber(obj.top, 0),
    scaleX: ensureNumber(obj.scaleX, 1),
    scaleY: ensureNumber(obj.scaleY, 1),
    angle: ensureNumber(obj.angle, 0),
    opacity: ensureNumber(obj.opacity, 1),
  };
}

function readObjectPositionByOrigin(
  obj: FabricObject,
  originX: "left" | "center" | "right",
  originY: "top" | "center" | "bottom",
) {
  const fn = (
    obj as unknown as {
      getPositionByOrigin?: unknown;
    }
  ).getPositionByOrigin;
  if (typeof fn !== "function") return null;
  try {
    const point = (
      obj as unknown as {
        getPositionByOrigin: (
          x: "left" | "center" | "right",
          y: "top" | "center" | "bottom",
        ) => { x?: unknown; y?: unknown };
      }
    ).getPositionByOrigin(originX, originY);
    const left = ensureNumber(point.x, NaN);
    const top = ensureNumber(point.y, NaN);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      return { left, top };
    }
  } catch {
    // ignore and fall back to width/height approximation
  }
  return null;
}

/**
 * 将 Fabric 对象的变换统一到编辑器内部约定：originX/originY = left/top。
 * - SVG 导入/部分 Fabric 对象的 origin 可能是 center/right/bottom
 * - 我们重建 FabricObject 时统一使用 left/top，如果不做归一化会出现位置偏移甚至绘制到画布外
 */
export function readNormalizedTransformFromObject(obj: FabricObject) {
  const transform = readTransformFromObject(obj);
  const positioned = readObjectPositionByOrigin(obj, "left", "top");
  if (positioned) {
    return { ...transform, left: positioned.left, top: positioned.top };
  }

  const originX = (obj as unknown as { originX?: unknown }).originX;
  const originY = (obj as unknown as { originY?: unknown }).originY;

  const scaledWidth =
    typeof (obj as unknown as { getScaledWidth?: unknown }).getScaledWidth ===
    "function"
      ? ensureNumber(
          (
            obj as unknown as { getScaledWidth: () => unknown }
          ).getScaledWidth(),
          0,
        )
      : ensureNumber(obj.width, 0) * transform.scaleX;
  const scaledHeight =
    typeof (obj as unknown as { getScaledHeight?: unknown }).getScaledHeight ===
    "function"
      ? ensureNumber(
          (
            obj as unknown as { getScaledHeight: () => unknown }
          ).getScaledHeight(),
          0,
        )
      : ensureNumber(obj.height, 0) * transform.scaleY;

  let left = transform.left;
  let top = transform.top;

  if (originX === "center") left -= scaledWidth / 2;
  else if (originX === "right") left -= scaledWidth;

  if (originY === "center") top -= scaledHeight / 2;
  else if (originY === "bottom") top -= scaledHeight;

  return { ...transform, left, top };
}

function toObjectRecord(obj: FabricObject) {
  try {
    const toObject = (obj as unknown as { toObject?: unknown }).toObject;
    if (typeof toObject === "function") {
      return (
        obj as unknown as {
          toObject: () => Record<string, unknown>;
        }
      ).toObject();
    }
  } catch {
    // ignore
  }

  return {};
}

export function serializeFabricObject(
  obj: FabricObject,
  patch?: Record<string, unknown>,
): SerializedFabricObject {
  const serialized = {
    ...toObjectRecord(obj),
    ...readNormalizedTransformFromObject(obj),
    ...patch,
    type: typeof obj.type === "string" ? obj.type : "object",
    originX: "left",
    originY: "top",
  } as MutableSerializedFabricObject;

  if (serialized.type === "path" && serialized.path == null) {
    const anyObj = obj as unknown as Record<string, unknown>;
    if (anyObj.path != null) serialized.path = anyObj.path;
    else if (anyObj._path != null) serialized.path = anyObj._path;
  }

  return serialized;
}

export function getNodeFabricType(node: EditorNode) {
  return node.fabricObject.type;
}

export function readNodeNumberProp(
  node: EditorNode,
  key: keyof SerializedFabricObject,
  fallback: number,
) {
  return ensureNumber(node.fabricObject[key], fallback);
}

export function readNodeStringProp(
  node: EditorNode,
  key: keyof SerializedFabricObject,
  fallback = "",
) {
  const value = node.fabricObject[key];
  return typeof value === "string" ? value : fallback;
}

function isNodeVisible(node: EditorNode, viewState: ViewState) {
  if (node.hidden) return false;

  if (node.business.type === "普通" || node.business.type === "非标注") {
    return true;
  }
  if (node.business.type === "非车线") return viewState.线条.非车线;
  if (node.business.type === "车线") return viewState.线条.车线;
  if (node.business.type === "标注") {
    return viewState.标注文本[node.business.字段];
  }

  return true;
}

function hasVisibleColor(color: string) {
  const normalized = color.trim().toLowerCase();
  return (
    normalized !== "" &&
    normalized !== "transparent" &&
    normalized !== "rgba(0,0,0,0)" &&
    normalized !== "rgba(0, 0, 0, 0)"
  );
}

export function getAnnotationBackgroundShape(
  node: EditorNode,
  domainAnnotationStyles: DocumentState["domain"]["标注样式"],
) {
  const style = resolveNodeAnnotationStyle(node, domainAnnotationStyles);
  if (!style.有边框) {
    return null;
  }
  return style.有边框.边框形状 === "圆形" ? "ellipse" : "rect";
}

export function createAnnotationBackgroundObject(
  shape: "rect" | "ellipse",
  options?: { excludeFromExport?: boolean },
) {
  const excludeFromExport = options?.excludeFromExport ?? true;
  if (shape === "ellipse") {
    return new Ellipse({
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
      excludeFromExport,
    });
  }

  return new Rect({
    originX: "left",
    originY: "top",
    selectable: false,
    evented: false,
    excludeFromExport,
  });
}

export function applyAnnotationBackgroundToTextNode(
  node: EditorNode,
  textObj: Textbox,
  backgroundObj: FabricObject,
  domainAnnotationStyles: DocumentState["domain"]["标注样式"],
  visible: boolean,
) {
  const style = resolveNodeAnnotationStyle(node, domainAnnotationStyles);
  if (!style.有边框) {
    backgroundObj.set({ visible: false });
    return;
  }
  const paddingX = 10;
  const paddingY = 6;
  const textWidth =
    typeof (textObj as unknown as { getScaledWidth?: unknown })
      .getScaledWidth === "function"
      ? ensureNumber(
          (
            textObj as unknown as { getScaledWidth: () => unknown }
          ).getScaledWidth(),
          0,
        )
      : ensureNumber(textObj.width, 0);
  const textHeight =
    typeof (textObj as unknown as { getScaledHeight?: unknown })
      .getScaledHeight === "function"
      ? ensureNumber(
          (
            textObj as unknown as { getScaledHeight: () => unknown }
          ).getScaledHeight(),
          0,
        )
      : ensureNumber(textObj.height, 0);
  const left = ensureNumber(
    textObj.left,
    ensureNumber(node.fabricObject.left, 0),
  );
  const top = ensureNumber(textObj.top, ensureNumber(node.fabricObject.top, 0));
  const width = textWidth + paddingX * 2;
  const height = textHeight + paddingY * 2;
  const fill = style.有边框.是否透明 ? "rgba(0,0,0,0)" : style.有边框.背景颜色;
  const strokeVisible = hasVisibleColor(style.有边框.边框颜色);
  const common = {
    fill,
    stroke: strokeVisible ? style.有边框.边框颜色 : undefined,
    strokeWidth: strokeVisible ? 1.5 : 0,
    selectable: false,
    evented: false,
    visible,
  };

  if (backgroundObj instanceof Ellipse) {
    backgroundObj.set({
      ...common,
      left: left + textWidth / 2,
      top: top + textHeight / 2,
      rx: width / 2,
      ry: height / 2,
    });
    return;
  }

  backgroundObj.set({
    ...common,
    left: left - paddingX,
    top: top - paddingY,
    width,
    height,
    rx: 0,
    ry: 0,
  });
}

export function applyNodeToObject(
  node: EditorNode,
  obj: FabricObject,
  viewState: ViewState,
  options?: { preserveTransform?: boolean },
  domainAnnotationStyles?: DocumentState["domain"]["标注样式"],
) {
  const visible = isNodeVisible(node, viewState);
  const { type: _type, ...props } = node.fabricObject;
  const {
    left: _left,
    top: _top,
    scaleX: _scaleX,
    scaleY: _scaleY,
    angle: _angle,
    opacity: _opacity,
    originX: _originX,
    originY: _originY,
    ...nonTransformProps
  } = props;
  const isLocked = node.locked;
  const interactionProps = {
    selectable: true,
    evented: true,
    lockMovementX: isLocked,
    lockMovementY: isLocked,
    lockScalingX: isLocked,
    lockScalingY: isLocked,
    lockRotation: isLocked,
    hasControls: !isLocked,
  };

  obj.set({
    ...(options?.preserveTransform ? nonTransformProps : props),
    ...interactionProps,
    visible,
    ...(options?.preserveTransform
      ? null
      : {
          originX: "left",
          originY: "top",
        }),
  });

  if (obj instanceof Textbox) {
    const resolvedStyle = resolveNodeAnnotationStyle(
      node,
      domainAnnotationStyles ?? {},
    );
    obj.set({
      editable: !isLocked,
      fontFamily: resolvedStyle.字体,
      fontSize: resolvedStyle.字号,
      fill: resolvedStyle.字色,
      textBackgroundColor: "",
    });
  }
}

export function createFabricObject(node: EditorNode): FabricObject {
  const serialized = { ...node.fabricObject } as MutableSerializedFabricObject;

  if (serialized.type === "rect") {
    return new Rect({
      ...serialized,
      originX: "left",
      originY: "top",
    });
  }

  if (serialized.type === "textbox" || serialized.type === "text") {
    const { path: _path, type: _type, text, ...rest } = serialized;
    return new Textbox(typeof text === "string" ? text : "", {
      ...rest,
      originX: "left",
      originY: "top",
      width: ensureNumber(serialized.width, 320),
    });
  }

  const { path, type: _type, ...rest } = serialized;
  return new Path(
    path as never,
    {
      ...(rest as unknown as Record<string, unknown>),
      originX: "left",
      originY: "top",
    } as never,
  );
}

export function createNodeFromFabricObject(
  obj: FabricObject,
  zIndex: number,
  name: string,
): EditorNode {
  const fabricType = typeof obj.type === "string" ? obj.type : "object";
  const business = createDefaultBusinessForFabricType(fabricType);
  return {
    id: createNodeIdForBusiness(fabricType, business),
    name,
    locked: false,
    hidden: false,
    zIndex,
    business,
    fabricObject: serializeFabricObject(obj),
  };
}

export function createPathNodeFromFabricPath(
  path: Path,
  zIndex: number,
): EditorNode {
  return createNodeFromFabricObject(path, zIndex, "非车线曲线");
}
