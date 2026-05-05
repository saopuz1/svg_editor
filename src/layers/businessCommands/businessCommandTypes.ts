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
