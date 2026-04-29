import { Path, Rect, Textbox, type FabricObject } from "fabric";
import type {
  EditorNode,
  NodeId,
  SerializedFabricObject,
} from "../../layers/data/types";
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

/**
 * 将 Fabric 对象的变换统一到编辑器内部约定：originX/originY = left/top。
 * - SVG 导入/部分 Fabric 对象的 origin 可能是 center/right/bottom
 * - 我们重建 FabricObject 时统一使用 left/top，如果不做归一化会出现位置偏移甚至绘制到画布外
 */
export function readNormalizedTransformFromObject(obj: FabricObject) {
  const transform = readTransformFromObject(obj);

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

  if (node.business.type === "未标记") return viewState.元素.未标记;
  if (node.business.type === "车线") return viewState.元素.车线;
  if (node.business.type === "标注") {
    return viewState.标注[node.business.字段];
  }

  return true;
}

export function applyNodeToObject(
  node: EditorNode,
  obj: FabricObject,
  viewState: ViewState,
  options?: { preserveTransform?: boolean },
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

  obj.set({
    ...(options?.preserveTransform ? nonTransformProps : props),
    selectable: !node.locked,
    evented: !node.locked,
    visible,
    ...(options?.preserveTransform
      ? null
      : {
          originX: "left",
          originY: "top",
        }),
  });
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
  return {
    id: crypto.randomUUID(),
    name,
    locked: false,
    hidden: false,
    zIndex,
    business: { type: "未标记" },
    fabricObject: serializeFabricObject(obj),
  };
}

export function createPathNodeFromFabricPath(
  path: Path,
  zIndex: number,
): EditorNode {
  return createNodeFromFabricObject(path, zIndex, "未标记曲线");
}
