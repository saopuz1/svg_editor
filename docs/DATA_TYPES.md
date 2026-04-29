# 数据类型说明

本文档解释本项目最关键的前端数据类型，以及它们为什么存在。
权威定义请以 `src/layers/data/types.ts` 为准。

## DocumentState（单一事实来源）

`DocumentState` 是编辑器唯一的权威状态（Single Source of Truth）。

关键字段：
- `meta`：文档身份、版本号、时间戳。
- `canvas`：画布 width/height/backgroundColor（Fabric Canvas 规格）。
- `scene`：编辑器内部可编辑场景（节点 map + 顺序）。
  - `scene.nodes: Record<NodeId, EditorNode>`
  - `scene.order: NodeId[]`
- `svg`：SVG 字符串（与 domain 解耦存储；导入/导出可直接使用）。
- `domain`：高针图业务数据（不记录布局坐标，只通过 NodeId 与 scene 关联）。

注意：
- `selection` 已在第一阶段重构中迁移到 `EditState`，不再属于可持久化文档内容。

为什么用 `scene.nodes + scene.order`：
- map 更新是 O(1)，适合频繁 patch。
- order 数组提供稳定顺序，不依赖对象 key 插入顺序。

## Domain（高针图业务数据）

`domain` 表示业务侧的“高针图 JSON”，它与 SVG/scene 解耦存储。

关键约束：
- `domain` 永不为 null：没有对应业务数据时用空数组/空对象表示。
- `domain` 不记录布局坐标：只通过 `NodeId` 关联到 `scene.nodes`（例如车线的 `标注NodeId`）。
- `domain.标注样式` 允许是空对象 `{}`（默认值），业务侧可按需逐步补齐字段。

## EditorNode（业务 + 图形）

`EditorNode` 组合了：
- `business: NodeBusiness`（节点的业务语义；domain 通过 NodeId 关联它）
- `fabricObject: SerializedFabricObject`（直接保存 Fabric 风格的可序列化对象）

其他常用字段：
- `locked`：在画布层面禁用选中/交互。
- `hidden`：无视 view filters 直接隐藏对象。

这种拆分让以下能力更自然：
- 业务处理不依赖 Fabric 实现细节
- 临时预览与持久显示使用同一套图形字段，减少导入/重建时的转换损耗

## NodeBusiness（业务语义）

`NodeBusiness` 是一个带判别字段的联合类型（discriminated union）：

- `{ type: '未标记' }`
  - 导入/新建图形的默认状态
  - 含义：不参与业务逻辑

- `{ type: '车线', ... }`
  - 主要业务实体，包含 `区域/档位/DML/尺数` 等字段
  - `标注NodeId` 通过 nodeId 关联多个标注节点，支持“一个业务实体由多节点表达”

- `{ type: '标注', 字段, 归属车线Id }`
  - 表示某条车线的某个字段标注（文本/图形），归属到 `归属车线Id`

为什么用 ID 关联，而不是在车线里嵌套标注：
- 避免拖拽/编辑时产生深层嵌套更新
- 标注节点可独立布局/样式/隐藏显示

## Graphic（Fabric 投影 schema）

`Graphic` 是一个稳定子集，用于表达 FabricObject 的关键属性。

当前变体：
- `rect`：width/height/fill/stroke/rx/ry + transform
- `textbox`：text/font/fontSize/textAlign + transform
- `path`：`path` 数据 + stroke + transform

为什么只存子集：
- Fabric 的完整类型很大且变动频繁。
- 编辑器只需要稳定 schema 来支持序列化与 undo/redo。

## Commands（Edit Layer）

命令不属于 `DocumentState`，但它是所有持久变更的“入口”。

相关文件：`src/layers/edit/commands.ts` 与 `src/layers/edit/editLayer.ts`。

关键约定：
- 所有持久变更必须走 `EditLayer.execute(command)`。
- undo/redo 通过保存每条命令的 `{ before, after }` 快照实现。

## EditState（编辑会话态）

`EditState` 表示“当前会话中的交互状态”，当前至少包含：
- `activeToolId`
- `tools`
- `selection`

为什么把 `selection` 放这里：
- 选区属于瞬时交互态，不是文档真相。
- 避免保存文件时带出“当前选中了谁”。
- 避免 undo/redo 被选区噪音污染。

## ViewState（仅视图偏好）

`ViewState` 控制可见性过滤：
- `元素.未标记 / 元素.车线`
- `标注.车线编号/区域/档位/单双/DML`

为什么不放进 `DocumentState`：
- 它是用户偏好，不是文档真相。
- 避免把开关操作污染到 undo/redo 历史里。
