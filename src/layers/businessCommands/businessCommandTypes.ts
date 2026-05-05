import type { DocumentState, NodeId } from "../data/types";

export type CanvasPoint = {
  x: number;
  y: number;
};

export const 高针图系统预置区域列表 = [
  { name: "尾巴", 车线长度: 7 },
  { name: "松颈", 车线长度: 13 },
  { name: "耳朵", 车线长度: 17 },
  { name: "竖车", 车线长度: 7 },
  { name: "横车", 车线长度: 6 },
  { name: "鱼眼", 车线长度: 2 },
  { name: "鱼眼上-短横车", 车线长度: 2 },
  { name: "鱼眼上-横车", 车线长度: 6 },
  { name: "鱼眼下-横车", 车线长度: 6 },
  { name: "拱形前网", 车线长度: 12 },
] as const;

export type SystemAreaPresetName =
  (typeof 高针图系统预置区域列表)[number]["name"];
export type AreaPresetId = SystemAreaPresetName | "自定义";

export interface AreaPresetOption {
  id: AreaPresetId;
  areaName: string;
  carlineLength: number;
  editableAreaName: boolean;
}

export const EXTRACT_CARLINE_AREA_PRESETS: readonly AreaPresetOption[] = [
  ...高针图系统预置区域列表.map((item) => ({
    id: item.name,
    areaName: item.name,
    carlineLength: item.车线长度,
    editableAreaName: false,
  })),
  {
    id: "自定义",
    areaName: "",
    carlineLength: 10,
    editableAreaName: true,
  },
] as const;

export type ExtractSelectionInput =
  | {
      mode: "single";
      point: CanvasPoint;
      targetNodeId: NodeId;
    }
  | {
      mode: "stroke";
      points: CanvasPoint[];
    };

export interface HitLineResult {
  nodeId: NodeId;
  hitPoint: CanvasPoint;
  hitOrder: number;
}

export interface ExtractCarlineAreaOptionDraft {
  presetId: AreaPresetId;
  areaName: string;
  carlineLength: number;
}

export interface ExtractCarlineSelectedLine {
  nodeId: NodeId;
  hitPoint: CanvasPoint;
}

export interface ExtractCarlineAreaDraft {
  areaName: string;
  presetId: AreaPresetId;
  carlineLength: number;
  selectedLines: ExtractCarlineSelectedLine[];
}

export interface ExtractCarlineCompletedArea extends ExtractCarlineAreaDraft {}

export interface ExtractCarlineSession {
  type: "提取车线";
  currentDraft: ExtractCarlineAreaDraft;
  completedAreas: ExtractCarlineCompletedArea[];
}

export interface PreviewLabelNodeSpec {
  id: NodeId;
  lineNodeId: NodeId;
  text: string;
  position: CanvasPoint;
  areaName: string;
}

export interface ExtractCarlinePreviewResult {
  document: DocumentState;
  previewLabelNodeIds: NodeId[];
}

// ─── 标记档位 Session 类型 ─────────────────────────────────────────────────

/** 单条档位标记：一条车线节点 + 交点位置 */
export interface MarkGearSelectedLine {
  nodeId: NodeId;
  hitPoint: CanvasPoint;
}

/** 单档数据（一轮勾选完成后进入 completedGears） */
export interface MarkGearCompletedGear {
  /** 档位编号，从 1 开始 */
  gearNumber: number;
  selectedLines: MarkGearSelectedLine[];
}

/** 标记档位 Session 状态 */
export interface MarkGearSession {
  type: "标记档位";
  /** 当前正在勾选的档位编号（1-based） */
  currentGearNumber: number;
  /** 当前档位已勾选的线条 */
  currentLines: MarkGearSelectedLine[];
  /** 已完成的档位列表 */
  completedGears: MarkGearCompletedGear[];
  /**
   * 所有车线节点 ID 集合（从 document.scene.nodes 中读取
   * business.type === "车线" 的节点）。
   * 只有这些节点才允许被勾选。
   */
  carlineNodeIds: ReadonlyArray<NodeId>;
}
