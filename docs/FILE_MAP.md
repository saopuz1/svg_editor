# 目录与文件职责地图

这是一份“这个文件到底是干嘛的”的实用地图，用于快速理解项目结构与分层理由。

## 根目录（Root）

- `package.json`：依赖与脚本（Vite dev/build、ESLint 等）。
- `vite.config.ts`：Vite + React 插件配置。
- `tsconfig.json`：TS 项目引用（app + node 两套配置）。
- `tsconfig.app.json`：浏览器端 TS 配置（React JSX、bundler mode）。
- `tsconfig.node.json`：Node 侧 TS 配置（主要用于 `vite.config.ts`）。
- `eslint.config.js`：ESLint flat config（TS + React Hooks + React Refresh）。
- `index.html`：Vite HTML 入口，挂载 `#root` 并加载 `src/main.tsx`。
- `public/*`：原样静态资源（favicon、svg 等）。
- `docs/*`：项目文档（架构、组件、文件地图、类型说明）。

为什么这样划分：
- 根目录保持“构建/运行装配”，实际业务代码全部放到 `src/`。

## `src/`

### `src/main.tsx`

React 入口：
- 引入全局样式（`index.css`）
- 挂载 `<App />`

### `src/App.tsx`

应用装配：
- 用 `<EditorProvider>` 包裹编辑器 UI
- 渲染 `<EditorShell />`

为什么这样做：
- `App` 保持极简；编辑器布局归属 View Layer。

### `src/app/`

应用级装配与依赖注入：

- `EditorContext.tsx`
  - editor 的 React Context Provider
  - 订阅 Data/Edit 状态的 hooks
- `createEditor.ts`
  - 兼容旧入口，转发到 `src/kernel/createEditor.ts`

为什么这样做：
- App 层只负责 React 注入；真正的内核装配已开始迁移到 `src/kernel/`。

### `src/kernel/`

Version C 第一阶段引入的内核入口层：

- `createEditor.ts`
  - 创建 editor 内核：`{ data, edit }`
  - 暴露 `EditorKernel` / `Editor` 类型
  - 装配 `commandRegistry`
  - 装配 `history`
  - 装配 `toolRegistry`

为什么这样做：
- 为后续扩展 `history / commands / tools / renderer / extensions` 预留统一入口。
- 先建立新边界，再逐步搬迁旧实现，降低一次性重构风险。

### `src/rendering/`

Version C 第二阶段引入的渲染适配层：

#### `src/rendering/fabric/`

- `fabricProjection.ts`
  - Fabric 投影辅助：`EditorNode -> FabricObject`
  - NodeId 绑定、transform 提取、path 节点构造
- `fabricImportExport.ts`
  - SVG 导入转换：把导入内容组装成新的 `DocumentState`
- `fabricEventBridge.ts`
  - Fabric 事件桥接：selection、对象变换、文本编辑、绘图工具事件
  - 将底层 Fabric 事件翻译成 Edit Layer 可消费的动作/命令
- `fabricToolControllers.ts`
  - Fabric 版本的工具控制器实现
  - 当前包含 `select-box / select-lasso / select-controls / draw-text / draw-path`

为什么这样做：
- 将 Fabric 纯逻辑从 React 组件中拆出，逐步把 `FabricStage` 变成装配层。
- 为后续继续抽 `FabricRenderer / ToolController` 做准备。

### `src/layers/`

编辑器内核，按“变化轴”组织：

#### `src/layers/data/`

Data Layer：文档模型与持久化/序列化相关。

- `types.ts`
  - 核心前端领域类型（`DocumentState`、`EditorNode` 等）
  - 业务 schema 与图形 schema 在这里收敛
  - `selection` 已不再属于文档状态
- `store.ts`
  - `DataStore` 外部 store 实现（`getState/setState/update/subscribe`）
  - `createDefaultDocument()` 初始状态工厂
- `serialization.ts`
  - `serializeDocument()` 与 `parseDocument()`（JSON 导入/导出）

为什么这样做：
- schema 与状态访问 API 集中管理，其他层统一依赖，避免散落。

#### `src/layers/edit/`

Edit Layer：描述“数据如何变化”。

- `commands.ts`
  - 类型化的命令定义与工厂
  - 节点构造器（如 `createRectNode()` / `createTextboxNode()`）
- `commandRegistry.ts`
  - 命令处理器协议与注册表
  - 收敛默认命令处理逻辑
- `history.ts`
  - undo/redo 历史状态定义
  - `HistoryManager` 实现
- `tools.ts`
  - 工具定义（`ToolId`、cursor、快捷键、工具分类）
- `toolController.ts`
  - 工具控制器协议与注册表
  - 定义 `ToolController` / `ToolControllerRegistry`
- `editLayer.ts`
  - 命令调度器 + 历史管理
  - 瞬时动作（selection）
  - 承接当前 `EditState.selection`
  - 当前已不直接持有历史实现细节

为什么这样做：
- 命令成为稳定 API 边界：便于持久化、撤销重做、协作回放与测试。

#### `src/layers/view/`

View Layer：UI + Fabric 投影层。

- `EditorShell.tsx`
  - 编辑器整体布局与面板
  - 将 UI 事件映射为命令
- `FabricStage.tsx`
  - Fabric Canvas 装配 + 事件桥接
  - 调用 rendering/fabric 下的投影、导入与事件桥接模块
- `viewState.ts`
  - view-only 的开关（可见性）

为什么这样做：
- View 经常变更（布局、交互、展示），不应频繁影响 Data/Edit 的语义。

### `src/components/`

`EditorShell` 使用的小型可复用 UI 原语：

- `MenuDropdown.tsx`：弹出菜单容器
- `MenuItem.tsx`：菜单行样式封装

为什么这样做：
- 抽离重复 UI 结构，让 View 层更聚焦。

### 样式

- `src/index.css`：全局主题变量与 reset。
- `src/App.css`：编辑器布局与组件样式。

为什么这样做：
- 全局主题 token 放一处；编辑器布局样式保持局部化与可维护性。
