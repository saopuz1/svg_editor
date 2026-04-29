# 前端架构说明

本项目是一个基于 Fabric.js 的编辑器骨架，技术栈为 React + TypeScript。核心设计目标是“关注点分离”，把编辑器拆成清晰的四层：

- Data Layer：单一事实来源（文档模型、持久化/序列化）
- Edit Layer：命令/工具/撤销重做（描述数据如何变化）
- View Layer：投影到 UI/Fabric Canvas（描述数据如何渲染、如何交互）
- App Layer：装配与依赖注入（把各层组装起来供 React 使用）
- Kernel Layer：内核入口与兼容门面（Version C 第一阶段已开始引入）
- Rendering Layer：渲染适配层（Version C 第二阶段已开始引入）

## 分层与职责

### App Layer（`src/app/*`）

App 层负责通过 React Context 暴露 editor 实例给组件树。

- `EditorProvider` 负责 editor 生命周期（一次挂载一个 editor 实例）。
- 当前 `EditorProvider` 已通过 `src/kernel/createEditor.ts` 装配内核。

为什么这样做：

- 保持 `DataStore` 与 `EditLayer` 框架无关（不依赖 React）。
- 避免全局单例，同时又保证 editor 实例稳定（不会每次渲染都重建）。

### Kernel Layer（`src/kernel/*`）

Kernel 层是 Version C 第一阶段新增的内核入口。

- `createEditor()` 负责装配：
  - `data: DataStore`（文档状态 store）
  - `edit: EditLayer`（命令执行器 + 历史记录 + 工具状态）
- `commandRegistry` 负责装配当前运行时可用的命令处理器。
- `history` 负责装配当前运行时可用的历史管理器。
- `toolRegistry` 负责装配当前运行时可用的工具控制器。
- `EditorKernel` 是后续扩展更完整内核门面的承接点。
- `src/app/createEditor.ts` 目前保留为兼容层，避免一次性修改所有旧 import。

为什么这样做：

- 把“React 应用层”与“编辑器内核入口”拆开，方便后续引入 history manager / command bus / tool registry / renderer facade。
- 让 Version C 的重构可以分阶段推进，而不是一次性推翻现有结构。

### Data Layer（`src/layers/data/*`）

Data 层定义并存储“文档状态”（唯一事实来源）：

- `DocumentState` 包含：
  - 画布规格（canvas）
  - 节点 map + 顺序 order
  - 业务域数据（如车线/标注/规则栈）

为什么这样做：

- View 永远不应该变成权威状态（Fabric 对象只是投影）。
- 通过记录命令前后的完整快照，实现确定性的 undo/redo。

### Edit Layer（`src/layers/edit/*`）

Edit 层表达“状态如何变化”，并提供：

- Commands（命令）：
  - 类型化的 `EditorCommand`（每种命令都有对应 payload）
  - 由 `EditLayer.execute(...)` 调度，再交给 `CommandRegistry` 执行并落到 Data
- History（历史）：
  - 由 `HistoryManager` 保存 `{ before, after, command }` 条目
  - undo/redo 通过切换快照实现
- Tool state（工具状态）：
  - `activeToolId`、工具定义、快捷键等
  - `selection`（当前选区，已从 DocumentState 迁入 EditState）
- Transient actions（瞬时动作）：
  - 示例：画布交互导致的 selection 变化（`act({ type: 'SET_SELECTION' })`）

为什么这样做：

- View 只负责表达意图（“用户想改什么”），Edit 层是唯一允许修改 Data 的地方。
- 命令日志是清晰的 API 边界，便于协作、持久化、以及后续测试/回放。
- `EditLayer` 逐步从“大型命令实现体”收敛为“会话/调度层”。

### View Layer（`src/layers/view/*`）

View 层负责渲染 UI，并把 `DocumentState` 投影到：

- React UI（菜单、属性面板、工具栏等）
- Fabric Canvas 对象（Rect/Textbox/Path）

关键点：Canvas 不是事实来源。

- 当 Data 变化时：
  - `FabricStage` 根据 `DocumentState.nodes` 更新/创建/删除 FabricObject
  - 应用 `ViewState` 的可见性过滤
  - 将 `EditState.selection` 同步为 Fabric 的 active selection
- 当用户在 Fabric 上交互时：
  - Fabric 发出事件（object modified、selection changed、text editing exited 等）
  - `FabricStage` 将事件转换为 `EditorCommand` 或瞬时 selection action
  - Edit 执行命令 -> Data 更新 -> View 重新投影

为什么这样做：

- 防止 Fabric 内部状态与业务模型漂移。
- 导入/导出与 undo/redo 都基于同一份状态，行为更一致可预期。

### Rendering Layer（`src/rendering/*`）

Rendering 层是 Version C 第二阶段开始引入的渲染适配层，目前先拆出了 Fabric 相关的纯逻辑模块。

- `fabricProjection.ts`
  - 负责 `EditorNode <-> FabricObject` 的映射辅助
  - 包含 NodeId 绑定、transform 读取、对象投影、path 节点构造
- `fabricImportExport.ts`
  - 负责把导入的 SVG 解析为 `DocumentState`
- `fabricEventBridge.ts`
  - 负责把 Fabric 事件桥接成编辑器动作
  - 当前包含通用编辑事件与工具交互事件两部分
- `fabricToolControllers.ts`
  - 负责具体工具控制器实现
  - 当前已拆出 `select-* / draw-text / draw-path`

为什么这样做：

- 把“如何投影到 Fabric”从 React 组件中抽离，避免 `FabricStage` 持续膨胀。
- 为后续继续拆分 `ToolRegistry / Renderer facade / Importer / Exporter` 打基础。

## 数据流（端到端）

### 渲染流（Data -> View）

1. `DataStore.setState/update(...)` 触发订阅者更新
2. React `useSyncExternalStore` 让订阅组件（如 `EditorShell`）重渲染
3. `FabricStage` 将 `DocumentState` 差量应用到 Fabric：
   - 确保 `order` 中的每个节点都有对应 FabricObject
   - 删除 `nodes` 中已不存在的对象
   - 按 `order` 调整图层顺序（bring to front）
4. `FabricStage` 通过 Rendering Layer 同步 selection：
   - `editState.selection` -> Fabric active object(s)

### 交互流（View -> Edit -> Data）

1. 用户动作触发：
   - 菜单点击（UI intent）
   - Fabric 事件（canvas intent）
2. View 层派发：
   - 工具事件先由 `ToolController` 解释
   - 持久变更走 `editor.edit.execute(createCommand(...))`
   - `EditLayer` 再委托给 `CommandRegistry`
   - 瞬时状态走 `editor.edit.act(...)`（如 selection）
3. Edit 层应用命令 -> 产生新的 `DocumentState`
4. Data 更新 -> View 投影更新

## 为什么这样划分目录

`layers/` 的组织方式是按“变化轴”拆分，而不是按页面/组件拆分：

- Data 层随“文档模型演进”变化（types、序列化、业务 schema）。
- Edit 层随“编辑能力演进”变化（工具、命令、撤销规则）。
- View 层随“UI/交互演进”变化（布局、面板、Fabric 集成）。

这能避免编辑器项目常见的耦合陷阱：UI、Canvas、业务逻辑互相缠绕，导致后续难以扩展和维护。
