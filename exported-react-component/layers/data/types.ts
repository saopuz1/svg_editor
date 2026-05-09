/** 唯一节点 ID：对应一个可被选中/变换/序列化的编辑对象。 */
export type NodeId = string;

/** 业务“车线”实体 ID：同一条车线可能由多个节点/标注节点共同表达。 */
export type CarlineId = string;

/** 业务字段：D/M/L 三选一。 */
export type DmlValue = "D" | "M" | "L";

/** 兼容业务命名：D/M/L 三选一。 */
export type DML值 = DmlValue;

/**
 * 车线的“标注节点”映射。
 * - key 为标注字段名称
 * - value 为对应标注在编辑器节点树中的 `NodeId`
 */
export interface AnnotationNodeIdMap {
  车线编号?: NodeId;
  档位?: NodeId;
  单双?: NodeId;
  DML?: NodeId;
}

/** 标注字段枚举：用于标注节点的 `business` 类型。 */
export type AnnotationField = "车线编号" | "区域" | "档位" | "单双" | "DML";

/** 通用图形节点：不参与线条/标注业务。 */
export type GenericNodeBusiness = { type: "普通" };

/** 线条节点：仅允许“非车线 / 车线”。 */
export type LineNodeBusiness =
  | { type: "非车线" }
  | {
      type: "车线";
      id: CarlineId;
      区域: string;
      车线编号: string;
      尺数: number;
      档位: string;
      DML?: DmlValue;
      是双数?: boolean;
      标注NodeId: AnnotationNodeIdMap;
    };

/** 文本节点：仅允许“非标注 / 标注”。 */
export type TextNodeBusiness =
  | { type: "非标注" }
  | {
      type: "标注";
      字段: AnnotationField;
      归属车线Id: CarlineId;
    };

/**
 * 节点的业务语义（与图形渲染解耦）。
 * - `普通`：非业务图形，如矩形等
 * - `非车线 / 车线`：仅用于线条类节点
 * - `非标注 / 标注`：仅用于文本类节点
 */
export type NodeBusiness =
  | GenericNodeBusiness
  | LineNodeBusiness
  | TextNodeBusiness;

/** 源文件类型：用于记录导入来源（影响兼容/解析策略）。 */
export type SourceFormat = "unknown" | "svg" | "coreldraw";

/** 文档元信息：用于版本演进、审计与来源追踪。 */
export interface DocumentMeta {
  documentId: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  sourceFormat?: SourceFormat;
  sourceName?: string;
}

/** 画布规格：Fabric Canvas 尺寸与背景色。 */
export interface CanvasSpec {
  width: number;
  height: number;
  backgroundColor: string;
}

/**
 * scene 中直接保存的 Fabric 风格序列化对象。
 * 约定：
 * - 存的是“可 JSON 序列化的对象描述”，不是活的 FabricObject 实例
 * - 以 Fabric 的字段命名为准，尽量减少中间映射层
 */
export interface SerializedFabricObject {
  type: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  opacity?: number;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  rx?: number;
  ry?: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  path?: unknown;
  originX?: string;
  originY?: string;
  [key: string]: unknown;
}

/**
 * 编辑器节点：一个“业务语义 + Fabric 序列化图形”的组合体。
 * - `business`：业务含义（普通/车线/标注等）
 * - `fabricObject`：Fabric 风格可序列化对象，作为 scene 的图形真相
 */
export interface EditorNode {
  id: NodeId;
  name: string;
  locked: boolean;
  hidden: boolean;
  zIndex: number;
  business: NodeBusiness;
  fabricObject: SerializedFabricObject;
  appearance?: 节点显示样式;
}

/**
 * 自动修改器（规则栈）配置：
 * 目前以示例形态存在，承载“程序化标注/自动批处理”的入口。
 */
type 自动修改器公共字段 = {
  id: string;
  规律: string[];
};

export type 自动修改器配置 =
  | (自动修改器公共字段 & {
      type: "按区域自动标注DML";
      范围: { 区域: string; 开始: number; 结束: number }[];
    })
  | (自动修改器公共字段 & {
      type: "按档位自动标注DML";
      范围: { 档位: string; 开始: number; 结束: number }[];
    });

export type AutoModifierConfig = 自动修改器配置;

export interface 标注边框样式 {
  边框形状: "圆形" | "方形";
  边框颜色: string;
  背景颜色: string;
  是否透明: boolean;
}

export interface 标注样式 {
  字体: string;
  字号: number;
  字色: string;
  有边框?: 标注边框样式;
}

export interface 节点显示样式 {
  标注样式?: 标注样式;
}

export interface 高针图车线 {
  id: CarlineId;
  车线编号: string;
  区域: string;
  尺数: number;
  档位: string;
  DML?: DML值;
  是双数?: boolean;
  标注NodeId: AnnotationNodeIdMap;
}

/**
 * 业务域数据（高针图 JSON）：与编辑器内部 scene 解耦的保存对象。
 * 约定：
 * - 不记录布局坐标（布局属于 scene/svg）
 * - 通过 NodeId 关联标注文本等可编辑节点
 */
export interface 高针图业务数据 {
  车线: 高针图车线[];
  标注样式: Partial<{
    车线编号: 标注样式;
    档位: 标注样式;
    单双?: 标注样式;
    DML?: 标注样式;
  }>;
  自动修改器: AutoModifierConfig[];
}

/** 编辑器内部场景数据：用于编辑/选中/命令/历史的可编辑模型。 */
export interface SceneState {
  nodes: Record<NodeId, EditorNode>;
  order: NodeId[];
}

/**
 * Data Layer 的“单一事实来源”状态（Single Source of Truth）。
 * 约定：
 * - `scene`：编辑器内部可编辑场景（布局与图形真相）
 * - `domain`：业务域数据（高针图），不记录布局坐标，只记录语义与 NodeId 关联
 * - `selection` 已迁移到 Edit Layer，避免把瞬时交互态写入文档真相
 */
export interface DocumentState {
  meta: DocumentMeta;
  canvas: CanvasSpec;
  scene: SceneState;
  /** 与业务 JSON 分离存储的 SVG 文本（产物字段）。 */
  svg: string;
  /** 业务 JSON：永不为 null（无业务数据即空数组/空对象）。 */
  domain: 高针图业务数据;
}
