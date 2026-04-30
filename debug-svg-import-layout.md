# Debug Session: svg-import-layout [FIXED]

## Symptom
- SVG 导入后布局仍然错乱，上一轮仅处理了 group transform 拍平问题，症状未消失。

## Scope
- 目标文件：`13X6雪花弹力网-3D1L.cdr.svg`
- 关注链路：`loadSVGFromString()` -> `buildDocumentFromSvgImport()` -> 编辑器节点重建 -> `FabricStage` 渲染

## Hypotheses
- H1: `loadSVGFromString()` 返回的叶子对象坐标本身就和 SVG 视觉位置不一致，问题发生在 Fabric 解析阶段。
- H2: `getImportedObjects()` 拍平后对象的 `left/top/pathOffset/origin` 组合与原对象不一致，导致重建后偏移。
- H3: `createPathNodeFromImportedShape()` 新建 `Path` 时丢失关键几何字段，尤其是 `pathOffset`、`skewX/skewY`、翻转或描边相关属性。
- H4: 文本导入时 `text/tspan` 到 `Textbox` 的转换造成锚点或基线偏移，看起来像“整体乱掉”。
- H5: 导入后的 `DocumentState` 正确，但 `applyNodeToObject()` / `createFabricObject()` 二次投影时又发生了位置归一化偏移。

## Evidence Plan
- 在 SVG 解析、group 拍平、节点序列化、FabricObject 重建四个阶段上报关键字段。
- 用同一批对象对比 `pre-fix` / `post-fix` 日志，确认错位出现在哪一层。

## Evidence Summary
- 预修复日志显示：`loadSVGFromString()` 已返回稳定的 Fabric 对象，前几批样本没有额外 `group` 矩阵，说明“仅仅是 group translate 丢失”不是这次文件的主因。
- 关键异常出现在导入重建阶段：源 `path` 对象是 `originX/Y = center/center`，并带有非零 `pathOffset`；但导入器手工新建 `Path` 时直接把 `obj.left/top` 当成 `left/top` 原点坐标使用。
- 运行时证据：日志中同一对象在 `source.left/top = 324.7759/401.8461` 时，序列化后的 `node.left/top = 226.1193/295.3478`，并且这个偏移恰好等于全局 `dx/dy`，没有按对象真实 `left/top` 原点换算。
- 结论：错乱第一次发生在 `buildDocumentFromSvgImport()` 的对象重建阶段，不是 `createFabricObject()` 二次投影导致。

## Hypothesis Status
- H1: 部分否定。Fabric 解析本身能产出稳定对象，但未证明和原图完全一致；当前主要错位不在解析入口。
- H2: 否定。当前复现中未看到父组矩阵是主要触发点。
- H3: 确认。`path` 导入时使用了错误的定位基准，且手工重建时丢失部分样式/几何字段。
- H4: 待定。当前日志样本以 path 为主，文本问题可能存在但不是首要根因。
- H5: 否定。`createFabricObject()` 重建结果与错误的节点数据一致，说明它只是复现了上游偏差。

## Fix Plan
- 用 Fabric 的 `getPositionByOrigin('left', 'top')` 获取对象真实左上基准，而不是用“center 减半宽高”或直接读取 `obj.left/top`。
- `createPathNodeFromImportedShape()` 改为使用归一化后的真实左上坐标，并补带更多路径样式字段。
- 保留日志，切到 `post-fix`，等待用户重新导入验证。

## Status
- Waiting for post-fix verification.
