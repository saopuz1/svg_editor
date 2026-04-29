# Debug Session: svg-import-draw-blank

Status: [OPEN]
Date: 2026-04-29
Debug Server: http://127.0.0.1:7777/event
Log File: .dbg/trae-debug-log-svg-import-draw-blank.ndjson

## Symptom

- Actual: 导入 SVG 不报错但画布空白；切到创建曲线工具也无法划线（无可见结果）
- Expected: 导入后可见对象；创建曲线可在画布中绘制并生成节点

## Repro Steps (User-Reported)

1. 启动页面
2. 导入 SVG
3. 画布空白
4. 切换到“创建曲线”工具，尝试在画布内按住拖动绘制
5. 仍然无可见结果

## Hypotheses (Falsifiable)

H1. 画布事件没有落到 Fabric（被覆盖层遮挡/`pointer-events`/容器尺寸异常），导致 mouse/path 事件不触发。

H2. 工具控制器没有被正确激活（`activeToolId` 未变化或 `bindFabricToolEvents` 未绑定/解绑正确），导致 `isDrawingMode`/brush 未生效。

H3. 命令执行成功但文档 state 没变化或变化没被渲染订阅消费（`editor.data.setState` 未触发/React 未 re-render），导致看起来“空白”。

H4. 节点确实生成了，但被绘制到画布可视区域外（viewportTransform/origin/scale/dpr），或被设置为 `visible: false`（viewState/hidden/locked）。

H5. 运行时存在未展示的异常（Promise rejected）导致后续流程中断，但 UI 没显示 importError。

## Instrumentation Plan

- 在 `FabricStage` / `fabricEventBridge` / `draw-path` controller 增加调试上报（不使用 console.log），采集：
  - canvas 尺寸、pointer events
  - tool 激活信息（activeToolId、isDrawingMode、selection/skipTargetFind）
  - 关键事件：mouse:down、path:created、load/import 后 nodes 数量
  - 渲染时对象数、可见对象数、bounding box 范围

## Evidence Log

TBD (will be written to Debug Server log stream)

## Fix Plan (After Evidence)

TBD
