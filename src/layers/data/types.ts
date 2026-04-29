/** 唯一节点 ID：对应一个可被选中/变换/序列化的编辑对象（FabricObject <-> EditorNode）。 */
export type NodeId = string;

/** 业务“车线”实体 ID：同一条车线可能由多个节点/标注节点共同表达。 */
export type CarlineId = string;

/** 业务字段：D/M/L 三选一。 */
export type DmlValue = "D" | "M" | "L";

/**
 * 车线的“标注节点”映射。
 * - key 为标注字段名称
 * - value 为对应标注在编辑器节点树中的 `NodeId`
 */
export interface AnnotationNodeIdMap {
  区域编号: NodeId;
  档位: NodeId;
  单双: NodeId;
  DML: NodeId;
}

/** 标注字段枚举：用于标注节点的 `business` 类型。 */
export type AnnotationField = "车线编号" | "区域" | "档位" | "单双" | "DML";

/**
 * 节点的业务语义（与图形渲染解耦）。
 * - `未标记`：仅作为图形存在，不参与业务逻辑
 * - `车线`：承载业务字段 + 关联的标注节点
 * - `标注`：表示某个字段的文本/图形标注，归属到某条车线
 */
export type NodeBusiness =
  | { type: "未标记" }
  | {
      type: "车线";
      id: CarlineId;
      编号: number;
      区域: string;
      区域编号: string;
      尺数: number;
      档位: string;
      DML: DmlValue;
      是双数: boolean;
      标注NodeId: AnnotationNodeIdMap;
    }
  | {
      type: "标注";
      字段: AnnotationField;
      归属车线Id: CarlineId;
    };

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
 * 编辑对象的通用变换属性（与 FabricObject 的 transform 对齐）。
 * - left/top: 以对象左上角为基准（本项目创建对象时固定 `originX/Y = 'left/top'`）
 */
export interface TransformProps {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
}

/**
 * 图形层描述：足够把一个 `EditorNode` 投影为 FabricObject。
 * 注意：
 * - 这里不是完整的 Fabric 类型定义，只保留编辑器需要的稳定子集
 * - `fabricType` 是自定义判别字段（discriminant）
 */
export type Graphic =
  | {
      fabricType: "rect";
      props: TransformProps & {
        width: number;
        height: number;
        fill: string;
        stroke: string;
        strokeWidth: number;
        rx: number;
        ry: number;
      };
    }
  | {
      fabricType: "textbox";
      props: TransformProps & {
        text: string;
        fontFamily: string;
        fontSize: number;
        fill: string;
        lineHeight: number;
        textAlign: "left" | "center" | "right" | "justify";
      };
    }
  | {
      fabricType: "path";
      props: TransformProps & {
        /**
         * Fabric Path 的原始路径数据。
         * 当前作为“可序列化的未知结构”存储，由 `FabricStage` 在创建 `Path` 时回填。
         */
        path: unknown;
        stroke: string;
        strokeWidth: number;
        fill: string | null;
      };
    };

/**
 * 编辑器节点：一个“业务语义 + 图形表达”的组合体。
 * - `business`：业务含义（车线/标注/未标记）
 * - `graphic`：渲染含义（rect/textbox/path）
 */
export interface EditorNode {
  id: NodeId;
  name: string;
  locked: boolean;
  hidden: boolean;
  zIndex: number;
  business: NodeBusiness;
  graphic: Graphic;
}

/**
 * 自动修改器（规则栈）配置：
 * 目前以示例形态存在，承载“程序化标注/自动批处理”的入口。
 */
export type AutoModifierConfig =
  | {
      id: string;
      type: "按区域自动标注DML";
      启用: boolean;
      规律: string[];
      范围: { 区域: string; 开始: number; 结束: number }[];
    }
  | {
      id: string;
      type: "按档位自动标注DML";
      启用: boolean;
      规律: string[];
      范围: { 档位: string; 开始: number; 结束: number }[];
    };

/**
 * 业务文档（穆吟丝规格图）：
 * - `svg`：原始/导出的 SVG 串（骨架里仅保留字段，具体生成逻辑可后续接入）
 * - `车线`、`标注样式`、`自动修改器`：预留业务域数据
 */
export interface MuYinSiSpecDiagram {
  svg: string;
  车线: Array<{ id: CarlineId }>;
  标注样式: Record<string, unknown>;
  自动修改器: AutoModifierConfig[];
}

/**
 * Data Layer 的“单一事实来源”状态（Single Source of Truth）。
 * 约定：
 * - `nodes` 存实体，`order` 存渲染/图层顺序，避免在 map 上依赖插入顺序
 * - `autoModifiers` 放在顶层：便于 Edit Layer 做命令化更新 + undo/redo
 * - `selection` 已迁移到 Edit Layer，避免把瞬时交互态写入文档真相
 */
export interface DocumentState {
  meta: DocumentMeta;
  canvas: CanvasSpec;
  business: MuYinSiSpecDiagram;
  nodes: Record<NodeId, EditorNode>;
  order: NodeId[];
  autoModifiers: AutoModifierConfig[];
}
