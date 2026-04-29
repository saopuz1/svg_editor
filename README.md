# Fabric SVG Editor（React + TypeScript）项目骨架

这是一个“可运行的编辑器骨架”，基于 Fabric.js 实现交互编辑，且按 **Data Layer / Edit Layer / View Layer** 三层拆分。

## 关键说明：Fabric 是否需要 Canvas？

Fabric.js 本质是 **HTML Canvas 的对象模型与交互封装**。

- 你不需要直接写原生 Canvas API（不手动 `getContext('2d')` 画线画矩形）
- 但页面里仍然必须存在 `<canvas>` 元素作为 Fabric 的渲染宿主

如果完全不想使用 `<canvas>`，则不能选择 Fabric 路线，需要采用“直接操作 SVG DOM”的编辑器方案。

## UI 布局（按你的要求）

- 顶部：命令（Undo/Redo、导入/导出、业务命令入口）
- 左侧：工具（选择/绘图） + 图层（单选/多选双向绑定）
- 顶部右侧：视图（元素/标注显示开关）
- 右侧：属性栏（**可拖拽缩放**）

整体黑白配色、以白色为主。

## 三层目录结构

- `src/layers/data/*`：Data Layer（文档模型、store、序列化）
- `src/layers/edit/*`：Edit Layer（工具状态、命令、历史 undo/redo）
- `src/layers/view/*`：View Layer（React UI + Fabric 投影/回流）
- `src/app/*`：装配/依赖注入（创建 editor、React Context hooks）

## 当前骨架已实现

- 工具：选择工具、创建文本（点击落点）、创建曲线（自由绘制）
- 图层：列表展示 + 单选/多选（ctrl/cmd 点击）
- 属性：图形属性（位置、颜色、字号、描边等）+ 业务属性（车线字段只允许改尺数/是双数）
- 视图：元素/标注显示开关（右上角“视图”）
- 编辑闭环：Fabric 交互（拖拽/缩放/旋转）会回写到 Data Layer
- Undo/Redo
- 导入 SVG（目前仅转换 rect/text 子集）
- 导出 SVG / 导出 JSON

## 本地运行

```bash
cd fabric-svg-editor
npm install
npm run dev
```

## 文档入口

- 架构说明：`docs/ARCHITECTURE.md`
- 组件/模块说明：`docs/COMPONENTS.md`
- 目录与文件职责：`docs/FILE_MAP.md`
- 数据类型说明：`docs/DATA_TYPES.md`
- 功能实现指南：`docs/IMPLEMENTATION_GUIDE.md`
- 编辑器 UI 规格：`docs/UI_SPEC.md`
- AI 开发规则：`docs/AI_DEV_RULES.md`

## 后续建议（业务命令落地）

目前“提取车线/标记档位/修改标注样式/绘制标注位置”在 UI 中已预留入口，后续可在 Edit Layer 中按命令模式补齐对应的数据变更与交互状态机。
