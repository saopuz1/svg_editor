import { Path, Rect, Textbox, type FabricObject } from "fabric";
import type { EditorNode, NodeId } from "../../layers/data/types";
import type { ViewState } from "../../layers/view/viewState";

export function ensureNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const NODE_ID_KEY = "__editorNodeId";

type ObjectWithCustom = FabricObject & Record<string, unknown>;

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
) {
  const visible = isNodeVisible(node, viewState);

  obj.set({
    left: node.graphic.props.left,
    top: node.graphic.props.top,
    scaleX: node.graphic.props.scaleX,
    scaleY: node.graphic.props.scaleY,
    angle: node.graphic.props.angle,
    opacity: node.graphic.props.opacity,
    selectable: !node.locked,
    evented: !node.locked,
    visible,
  });

  if (node.graphic.fabricType === "rect" && obj instanceof Rect) {
    obj.set({
      width: node.graphic.props.width,
      height: node.graphic.props.height,
      fill: node.graphic.props.fill,
      stroke: node.graphic.props.stroke,
      strokeWidth: node.graphic.props.strokeWidth,
      rx: node.graphic.props.rx,
      ry: node.graphic.props.ry,
    });
  }

  if (node.graphic.fabricType === "textbox" && obj instanceof Textbox) {
    obj.set({
      text: node.graphic.props.text,
      fill: node.graphic.props.fill,
      fontFamily: node.graphic.props.fontFamily,
      fontSize: node.graphic.props.fontSize,
      lineHeight: node.graphic.props.lineHeight,
      textAlign: node.graphic.props.textAlign,
    });
  }

  if (node.graphic.fabricType === "path" && obj instanceof Path) {
    obj.set({
      stroke: node.graphic.props.stroke,
      strokeWidth: node.graphic.props.strokeWidth,
      fill: node.graphic.props.fill,
    });
  }
}

export function createFabricObject(node: EditorNode): FabricObject {
  if (node.graphic.fabricType === "rect") {
    return new Rect({
      ...node.graphic.props,
      originX: "left",
      originY: "top",
    });
  }

  if (node.graphic.fabricType === "textbox") {
    return new Textbox(node.graphic.props.text, {
      ...node.graphic.props,
      originX: "left",
      originY: "top",
      width: 320,
    });
  }

  const { path, ...rest } = node.graphic.props;
  return new Path(
    path as never,
    {
      ...(rest as unknown as Record<string, unknown>),
      originX: "left",
      originY: "top",
    } as never,
  );
}

export function createPathNodeFromFabricPath(
  path: Path,
  zIndex: number,
): EditorNode {
  const transform = readNormalizedTransformFromObject(path);

  return {
    id: crypto.randomUUID(),
    name: "未标记曲线",
    locked: false,
    hidden: false,
    zIndex,
    business: { type: "未标记" },
    graphic: {
      fabricType: "path",
      props: {
        ...transform,
        path: (path as unknown as { path?: unknown }).path ?? null,
        stroke: typeof path.stroke === "string" ? path.stroke : "#111827",
        strokeWidth: ensureNumber(path.strokeWidth, 2),
        fill: typeof path.fill === "string" ? path.fill : null,
      },
    },
  };
}
