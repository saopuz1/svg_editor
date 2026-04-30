import type {
  DocumentState,
  EditorNode,
  NodeBusiness,
  NodeId,
  标注样式,
} from "../data/types";
import { createDefaultBusinessForFabricType } from "../data/business";
import { createNodeIdForBusiness } from "../data/idRules";

export type CommandType =
  | "新增节点"
  | "删除节点"
  | "设置节点状态"
  | "更新图形属性"
  | "批量更新图形属性"
  | "设置业务属性"
  | "设置节点标注样式"
  | "更新车线字段"
  | "设置自动修改器"
  | "加载文档";

export type CommandPayloadMap = {
  新增节点: { node: EditorNode };
  删除节点: { nodeIds: NodeId[] };
  设置节点状态: {
    nodeId: NodeId;
    locked?: boolean;
  };
  更新图形属性: {
    nodeId: NodeId;
    patch: Record<string, unknown>;
  };
  批量更新图形属性: {
    patches: Array<{
      nodeId: NodeId;
      patch: Record<string, unknown>;
    }>;
  };
  设置业务属性: {
    nodeId: NodeId;
    business: NodeBusiness;
    nextNodeId?: NodeId;
  };
  设置节点标注样式: {
    nodeId: NodeId;
    style: 标注样式;
  };
  更新车线字段: {
    nodeId: NodeId;
    尺数?: number;
    是双数?: boolean;
  };
  设置自动修改器: { autoModifiers: DocumentState["domain"]["自动修改器"] };
  加载文档: { document: DocumentState };
};

export type EditorCommand = {
  [TType in CommandType]: {
    id: string;
    type: TType;
    timestamp: number;
    source: "user" | "system";
    payload: CommandPayloadMap[TType];
  };
}[CommandType];

export type TransientAction = {
  type: "SET_SELECTION";
  payload: { nodeIds: NodeId[] };
};

export function createCommand<TType extends CommandType>(
  type: TType,
  payload: CommandPayloadMap[TType],
  source: EditorCommand["source"] = "user",
): Extract<EditorCommand, { type: TType }> {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    source,
    payload,
  } as Extract<EditorCommand, { type: TType }>;
}

export function createRectNode(): EditorNode {
  const business = createDefaultBusinessForFabricType("rect");
  const id = createNodeIdForBusiness("rect", business);
  return {
    id,
    name: "普通矩形",
    locked: false,
    hidden: false,
    zIndex: 0,
    business,
    fabricObject: {
      type: "rect",
      left: 80,
      top: 80,
      width: 180,
      height: 120,
      fill: "#ffffff",
      stroke: "#111111",
      strokeWidth: 2,
      rx: 8,
      ry: 8,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      opacity: 1,
      originX: "left",
      originY: "top",
    },
  };
}

export function createTextboxNode(at?: {
  left: number;
  top: number;
}): EditorNode {
  const business = createDefaultBusinessForFabricType("textbox");
  const id = createNodeIdForBusiness("textbox", business);
  return {
    id,
    name: "非标注文本",
    locked: false,
    hidden: false,
    zIndex: 0,
    business,
    fabricObject: {
      type: "textbox",
      left: at?.left ?? 140,
      top: at?.top ?? 120,
      text: "双击编辑",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: 24,
      fill: "#111111",
      lineHeight: 1.2,
      textAlign: "left",
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      opacity: 1,
      width: 320,
      originX: "left",
      originY: "top",
    },
  };
}
