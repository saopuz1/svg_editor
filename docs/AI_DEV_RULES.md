# AI 开发规则

本文档是“给 AI 的开发边界说明”。
如果后续让 AI 继续实现功能、工具、页面或业务逻辑，必须遵守本文件。

目标：

- 保持当前架构边界稳定
- 避免把重构成果写回成“大一统组件”
- 提高 AI 连续开发的一致性

## 必须遵守的核心规则

### 1. 不允许绕过命令系统做持久变更

凡是会改变文档内容的操作，必须通过：

```ts
editor.edit.execute(createCommand(...))
```

禁止：
- 直接调用 `editor.data.setState(...)`
- 在页面组件里直接拼接完整新 state
- 在 FabricObject 上存业务真相并不回写文档

### 2. 不允许把瞬时状态写回 DocumentState

瞬时状态包括但不限于：
- selection
- hover
- focus
- drawing session
- 面板本地显示态

这些状态必须留在：
- `EditState`
- React 组件本地状态
- ToolController 会话中

### 3. 不允许把新工具逻辑直接写进 FabricStage

新工具逻辑必须优先落到：
- `ToolController`
- `ToolControllerRegistry`
- `rendering/fabric/fabricToolControllers.ts`

禁止：
- 在 `FabricStage.tsx` 中继续堆 `if (activeToolId === ...)`
- 在 `fabricEventBridge.ts` 里直接实现复杂工具行为

### 4. 不允许把新命令逻辑直接塞回 EditLayer

新命令应放到：
- `src/layers/edit/commands.ts`
- `src/layers/edit/commandRegistry.ts`

禁止：
- 在 `EditLayer` 中恢复大型 `switch`
- 在 UI 组件中写命令具体执行逻辑

### 5. 不允许让 Fabric 成为事实来源

Fabric 只是渲染层。

禁止：
- 依赖 Fabric 内部对象存储长期业务状态
- 先改 Fabric 再不回写文档
- 只更新 FabricObject，不更新 `DocumentState`

## 实现落点规则

### 如果要新增功能按钮

优先落点：
- `EditorShell` 或拆分出来的 UI 组件

但按钮触发的持久变更必须：
- 创建命令
- 调 `editor.edit.execute(...)`

### 如果要新增业务操作

必须落点：
- `commands.ts`
- `commandRegistry.ts`

### 如果要新增工具

必须落点：
- `tools.ts`
- `toolController.ts`
- `fabricToolControllers.ts`

### 如果要新增 Fabric 投影能力

优先落点：
- `fabricProjection.ts`
- `fabricImportExport.ts`
- `fabricEventBridge.ts`

不要直接堆回 `FabricStage.tsx`。

### 如果要新增页面结构

优先落点：
- `layers/view/*`
- 或后续拆分出来的 `ui/*`

页面组件只能：
- 读取状态
- 触发命令
- 维护 view-only 本地 UI 状态

## 允许的简化策略

以下情况可以接受“先做简版”：

- CoreDraw 导入先保留占位入口
- 复杂 SVG 子元素先部分支持
- 属性面板先支持单选，不立即支持多选混合态
- 高级工具先做基础版，不立即做完整控制点编辑

但必须明确：
- 入口存在
- 未实现逻辑不要伪装成已完成
- 使用显式提示或 TODO 注释

## 禁止事项清单

AI 开发时禁止出现以下问题：

- 把新的业务字段直接随意塞进任意 React 组件
- 直接在 `EditorShell.tsx` 里实现复杂命令逻辑
- 直接在 `FabricStage.tsx` 里实现新的整套工具
- 通过复制现有代码大段粘贴实现多个相似能力而不抽象
- 修改现有架构边界但不更新文档
- 引入新的状态来源，导致单一事实来源失效

## AI 提交前检查清单

每次完成一个功能，必须自检：

1. 是否放在正确层级
2. 是否所有持久变更都走命令
3. 是否错误修改了 `DocumentState` / `EditState` 边界
4. 是否让 `FabricStage` / `EditorShell` 重新膨胀
5. 是否更新相关文档
6. 是否通过诊断
7. 是否能通过构建

## 推荐开发顺序

AI 实现一个新需求时，推荐顺序：

1. 先读：
   - `docs/ARCHITECTURE.md`
   - `docs/FILE_MAP.md`
   - `docs/DATA_TYPES.md`
   - `docs/IMPLEMENTATION_GUIDE.md`
   - `docs/UI_SPEC.md`
   - 本文档

2. 判断需求类型：
   - 页面
   - 工具
   - 命令
   - 导入导出
   - 数据模型

3. 决定文件落点

4. 先改底层协议，再接 UI

5. 最后跑诊断与构建

## 当前架构的推荐扩展方向

AI 后续优先沿这些方向扩展：

- 增加新的 `ToolController`
- 增加新的 `CommandHandler`
- 增加更细的 Inspector UI
- 增加更强的 SVG 导入导出
- 增加业务扩展层

不建议优先做：

- 再次大规模改目录
- 大幅重写 `FabricStage`
- 未经说明地改变历史机制
- 重新引入直接 store 更新模式

