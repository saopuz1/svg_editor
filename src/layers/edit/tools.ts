export type ToolId =
  | "select-box"
  | "select-lasso"
  | "draw-path"
  | "draw-line"
  | "draw-text";

export type SelectToolMode = "单选框选" | "划线选择";
export type DrawToolMode = "创建曲线" | "创建直线" | "创建文本";

export type ToolType = "选择工具" | "绘图工具";

export interface ToolDefinition<TPayload = unknown> {
  id: ToolId;
  type: ToolType;
  /** 逻辑名称 / tooltip 默认名称 */
  name: string;
  /** 左侧工具栏放大时显示用名称（不填则回退到 name） */
  toolbarName?: string;
  cursor: string;
  shortcut?: string;
  payload?: TPayload;
}

export type EditorTool =
  | ToolDefinition<{ mode: SelectToolMode }>
  | ToolDefinition<{ mode: DrawToolMode }>;

export const DEFAULT_TOOLS: EditorTool[] = [
  {
    id: "select-box",
    type: "选择工具",
    name: "单选/框选",
    toolbarName: "单选/框选",
    cursor: "default",
    shortcut: "V",
    payload: { mode: "单选框选" },
  },
  {
    id: "select-lasso",
    type: "选择工具",
    name: "划线选择",
    toolbarName: "划线选择",
    cursor: "crosshair",
    shortcut: "L",
    payload: { mode: "划线选择" },
  },
  {
    id: "draw-path",
    type: "绘图工具",
    name: "创建曲线",
    toolbarName: "曲线",
    cursor: "crosshair",
    shortcut: "P",
    payload: { mode: "创建曲线" },
  },
  {
    id: "draw-line",
    type: "绘图工具",
    name: "创建直线",
    toolbarName: "直线",
    cursor: "crosshair",
    shortcut: "I",
    payload: { mode: "创建直线" },
  },
  {
    id: "draw-text",
    type: "绘图工具",
    name: "创建文本",
    toolbarName: "文本",
    cursor: "text",
    shortcut: "T",
    payload: { mode: "创建文本" },
  },
];

export const DEFAULT_ACTIVE_TOOL_ID: ToolId = "select-box";

export function getTool(tools: EditorTool[], toolId: ToolId): EditorTool {
  const found = tools.find((t) => t.id === toolId);
  return found ?? tools[0];
}
