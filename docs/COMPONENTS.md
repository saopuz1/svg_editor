# 组件与模块说明

本文档描述本仓库的主要前端模块与 React 组件，以及它们的职责与协作关系。

## App 装配

### `EditorProvider`（`src/app/EditorContext.tsx`）

职责：
- 持有 editor 实例生命周期（`createEditor()` 只在首次挂载时执行一次）。
- 通过 React Context 暴露 editor 实例。

对外导出：
- `useEditor()`：返回 editor 实例（`{ data, edit }`）。
- `useDocumentState()`：用 `useSyncExternalStore` 订阅 `editor.data`。
- `useEditState()`：用 `useSyncExternalStore` 订阅 `editor.edit`。

为什么这样做：
- `useSyncExternalStore` 是 React 官方推荐的外部 store 订阅方式。
- 保持 `DataStore` / `EditLayer` 与 React 解耦（可复用、可测试）。

### `createEditor`（`src/kernel/createEditor.ts`）

职责：
- 创建并装配编辑器“内核”：
  - `DataStore(createDefaultDocument())`
  - `EditLayer(data)`
  - `CommandRegistry`
  - `HistoryManager`
  - `ToolControllerRegistry`

为什么这样做：
- 依赖注入集中在一个入口，后续扩展插件/服务/埋点会更容易。

## View 组件

### `EditorShell`（`src/layers/view/EditorShell.tsx`）

职责：
- 顶层编辑器 UI 布局：
  - 顶部菜单（File / Edit / View）
  - 工具选项/状态栏
  - 左侧工具栏（选择工具）
  - 中央画布区域（纸张容器 + `FabricStage`）
  - 右侧面板（属性 Inspector + 规则栈 Rules，支持拖拽缩放/收起）
- 将 UI 交互转换为 editor commands：
  - 新增/删除节点
  - patch 图形属性
  - 设置业务属性
  - 管理 modifiers（规则栈）列表
  - 通过 `editor.edit` 触发 undo/redo
- 维护 view-only 状态：
  - `viewState`（可见性过滤）
  - UI 开关（左右面板收起、右侧 tab 等）

传给 `FabricStage` 的关键 props：
- `editor`：编辑器内核
- `document`：当前 `DocumentState`
- `selection`：当前 `EditState.selection`
- `activeToolId`：当前工具模式
- `viewState`：元素/标注可见性开关

### `FabricStage`（`src/layers/view/FabricStage.tsx`）

职责：
- 持有 Fabric `Canvas` 实例与 `<canvas>` DOM。
- 维护 `NodeId -> FabricObject` 映射。
- 装配 Fabric 事件桥接与工具模式切换。
- selection 双向同步：
  - Fabric selection 事件 -> `EditLayer.act(SET_SELECTION)`
  - EditState selection 变化 -> 设置 Fabric active object(s)
- 将 Fabric 交互转换为命令：
  - 变换（拖拽/缩放/旋转）-> `更新图形属性`
  - 文本编辑结束 -> `更新图形属性(text)`
  - draw-text 点击空白处 -> `新增节点(textbox)`
  - draw-path 画笔完成 -> `新增节点(path)`
- 通过 ref 暴露导入导出 API：
  - `exportSvg()`
  - `exportJson()`
  - `importSvg(svg)`

重要约束：
- Fabric 只是投影，不是事实来源。
- 所有“持久变更”必须走 `EditLayer.execute(...)`。

当前已拆出的辅助模块：
- `src/rendering/fabric/fabricProjection.ts`
  - 负责节点到 FabricObject 的投影辅助
- `src/rendering/fabric/fabricImportExport.ts`
  - 负责 SVG 导入转换
- `src/rendering/fabric/fabricEventBridge.ts`
  - 负责 Fabric 事件到编辑动作/命令的桥接
- `src/rendering/fabric/fabricToolControllers.ts`
  - 负责具体工具行为控制器

### `ToolControllerRegistry`（`src/layers/edit/toolController.ts`）

职责：
- 提供工具控制器注册与查找能力。
- 让工具行为不再写死在 `FabricStage` 或 `fabricEventBridge` 中。

当前状态：
- 已通过 kernel 装配默认 Fabric 工具控制器。
- 当前已覆盖 `select-* / draw-text / draw-path`。

### `CommandRegistry`（`src/layers/edit/commandRegistry.ts`）

职责：
- 提供命令处理器注册与执行能力。
- 收敛默认命令处理逻辑，替代 `EditLayer` 中的大型 `switch`。

当前状态：
- 已通过 kernel 装配默认命令处理器。
- 当前已覆盖 `新增节点 / 删除节点 / 更新图形属性 / 设置业务属性 / 更新车线字段 / 设置自动修改器 / 加载文档`。

### `HistoryManager`（`src/layers/edit/history.ts`）

职责：
- 负责历史记录存储、`record()`、`undo()`、`redo()`。
- 把历史实现从 `EditLayer` 中抽离出去。

当前状态：
- 已通过 kernel 装配。
- 当前仍采用快照式历史（`before/after`）。

### `ViewState`（`src/layers/view/viewState.ts`）

职责：
- 定义 view-only 的可见性开关（元素类别、标注字段）。

为什么这样做：
- 过滤逻辑不应该进入 Data（可见性通常是用户偏好，不是文档真相）。

## 通用 UI 组件

### `MenuDropdown`（`src/components/MenuDropdown.tsx`）

职责：
- 标签触发的简单弹出菜单。
- 支持点击外部关闭，并支持键盘操作（Enter/Space/Escape）。

备注：
- children 是原始节点，菜单内容由调用方（`EditorShell`）组合。

### `MenuItem`（`src/components/MenuItem.tsx`）

职责：
- 基于 `<div>` 的轻量封装，接收标准 HTML attributes，并统一 menu row 的样式。

为什么这样做：
- 维持样式一致性，同时不引入完整 UI 组件库。
