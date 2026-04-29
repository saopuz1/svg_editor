# 功能实现指南

本文档面向“继续在当前项目上实现功能的人或 AI”，目标是回答三个问题：

- 新功能应该放到哪一层
- 新功能应该如何接入当前架构
- 实现完成后需要满足哪些最小约束

本文档默认基于当前 Version C 重构后的架构：

- `kernel`：内核装配入口
- `layers/data`：文档状态与 schema
- `layers/edit`：命令、历史、工具协议、编辑会话态
- `layers/view`：React 页面与 Fabric 画布外壳
- `rendering/fabric`：Fabric 适配层

## 总原则

### 1. 文档状态与编辑状态分离

- `DocumentState` 只存“需要保存到文档里的真相”
- `EditState` 只存“当前编辑会话中的瞬时状态”

放进 `DocumentState` 的典型内容：
- `canvas`：画布规格
- `scene`：节点与顺序（编辑器内部可编辑场景）
- `svg`：SVG 字符串（与 domain 解耦存储）
- `domain`：高针图业务数据（仅 NodeId 关联，不记录布局坐标；默认永不为 null）

放进 `EditState` 的典型内容：
- 当前工具
- 当前选区
- hover/focus
- 临时会话状态

### 2. 持久变更必须走命令

凡是会改变文档内容的操作，都必须通过：

```ts
editor.edit.execute(createCommand(...))
```

不要直接调用：

- `editor.data.setState(...)`
- `editor.data.update(...)`

除非你明确在改“内核底层实现”而不是在做业务功能。

### 3. 工具行为必须走 ToolController

凡是“由工具模式触发的交互逻辑”，都应优先放到：

- `ToolController`
- `ToolControllerRegistry`
- `rendering/fabric/fabricToolControllers.ts`

不要把新的工具逻辑直接写进：

- `FabricStage.tsx`
- `fabricEventBridge.ts`

### 4. Fabric 只是渲染投影，不是事实来源

任何 FabricObject 的变化都要回写为命令，最终修改 `DocumentState`。

不要把业务数据长期挂在 FabricObject 上作为真相来源。

## 新功能应该放在哪

### 情况 A：新增一个可撤销的业务操作

例子：
- 批量删除
- 设置标注样式
- 标记车线
- 应用规则栈

应放在：
- `src/layers/edit/commands.ts`：补充命令类型与 payload
- `src/layers/edit/commandRegistry.ts`：补充默认命令处理器
- 触发位置所在的 UI / ToolController：调用 `createCommand(...)`

### 情况 B：新增一个工具

例子：
- 画矩形
- 画箭头
- 钢笔工具
- 节点编辑工具

应放在：
- `src/layers/edit/tools.ts`：补工具定义
- `src/rendering/fabric/fabricToolControllers.ts`：补工具控制器实现
- 必要时补对应命令处理器

### 情况 C：新增一个属性面板字段

例子：
- 文本字重
- 路径描边宽度
- 业务字段编辑项

应放在：
- `src/layers/view/EditorShell.tsx` 或后续拆分出来的 Inspector 组件
- 对应字段变更仍然走命令，不要直接写 store

### 情况 D：新增导入/导出能力

例子：
- 导入更多 SVG 元素
- 导出业务图纸
- 导入自定义 JSON

应放在：
- `src/rendering/fabric/fabricImportExport.ts`
- 必要时新增单独 importer/exporter 模块

### 情况 E：新增文档模型字段

例子：
- 图层分组
- 约束信息
- 业务扩展字段

应放在：
- `src/layers/data/types.ts`
- `src/layers/data/store.ts`
- `src/layers/edit/commandRegistry.ts` 中对应命令处理器
- 同步更新 `docs/DATA_TYPES.md`

## 推荐实现流程

实现任何新功能，按下面步骤做：

1. 明确功能属于哪类：
   - 文档命令
   - 工具交互
   - UI 面板
   - 导入导出
   - 数据模型扩展

2. 先确定状态落点：
   - 是 `DocumentState`
   - 还是 `EditState`

3. 如果会改文档：
   - 先定义命令
   - 再实现 handler
   - 最后在 UI/工具里触发

4. 如果是工具：
   - 先补 `tools.ts`
   - 再补 controller
   - 不要直接在 `FabricStage` 写 `if (toolId === ...)`

5. 如果是 UI：
   - 先确定只是展示，还是会产生命令
   - 凡是会落盘的修改都必须经过 `editor.edit.execute(...)`

6. 完成后检查：
   - 是否可撤销
   - 是否会破坏选区
   - 是否影响导入导出
   - 是否需要更新文档

## 新命令实现模板

### 第一步：补命令类型

在 `src/layers/edit/commands.ts` 中增加：

```ts
export type CommandType =
  | '你的命令';

export type CommandPayloadMap = {
  你的命令: { ... };
};
```

### 第二步：补命令处理器

在 `src/layers/edit/commandRegistry.ts` 中注册：

```ts
registry.register({
  type: '你的命令',
  execute: (state, command, context) => {
    return {
      ...state,
      meta: { ...state.meta, updatedAt: context.now, version: state.meta.version + 1 },
    };
  },
});
```

### 第三步：在 UI 或工具中触发

```ts
editor.edit.execute(
  createCommand('你的命令', payload),
  '用户可读标签',
);
```

## 新工具实现模板

### 第一步：注册工具定义

在 `src/layers/edit/tools.ts` 增加 `ToolId` 与 `DEFAULT_TOOLS` 条目。

### 第二步：实现控制器

在 `src/rendering/fabric/fabricToolControllers.ts` 中增加：

```ts
const yourToolController: ToolController = {
  id: 'your-tool',
  activate({ canvas, editor }) {
    return () => {};
  },
};
```

### 第三步：注册控制器

在 `registerDefaultFabricToolControllers(...)` 中注册。

## UI 实现约定

### Inspector

- 面板只负责展示与触发命令
- 不直接保存本地副本为真相
- 没选中对象时必须显示空状态

### 菜单 / 按钮

- 文档级操作优先放菜单
- 工具切换放左侧工具栏
- 规则相关操作优先放右侧规则面板

### 错误处理

- 导入错误：显示显式错误信息
- 未实现功能：可以临时保留提示，但不要伪实现

## 历史与撤销约定

当前历史系统仍是快照式：

- `before`
- `after`
- `command`

因此新功能实现时应遵守：

- 单次用户动作尽量对应单次命令
- 避免在 `onChange` 中高频提交大量历史
- 如是高频编辑，优先用 `onBlur` 或 debounce

## 完成后的最小检查清单

- 是否放在正确层级
- 是否绕过了 `CommandRegistry`
- 是否错误地把瞬时状态写入 `DocumentState`
- 是否让 `FabricStage` 重新变胖
- 是否更新了对应文档
- 是否通过诊断和构建
