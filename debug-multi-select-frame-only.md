# Debug Session: multi-select-frame-only
- **Status**: [FIXED]
- **Issue**: 多选节点后拖动/松开鼠标，出现只有选框还能移动、节点本体不跟随的问题。
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-multi-select-frame-only.ndjson

## Reproduction Steps
1. 选择多个节点。
2. 按住鼠标左键拖动多选框。
3. 松开鼠标左键。
4. 继续移动或再次点击，观察是否出现“只有框能动，节点不动”。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | `object:modified` 对 `ActiveSelection` 的处理打断了 Fabric 的正常结束流程，留下了脱离节点的瞬态选框 | High | Low | Confirmed |
| B | `FabricStage` 在错误的时机重建/销毁 `ActiveSelection`，导致交互中的活动组与画布真实对象脱钩 | High | Low | Confirmed |
| C | 划线选择工具仍在拖拽路径中抢占了鼠标事件，影响多选框正常结束和重新命中 | Medium | Low | Rejected |
| D | 组内对象在 `discardActiveObject()` 前后坐标状态异常，节点已更新但活动框未销毁或被重复恢复 | High | Medium | Confirmed |

## Log Evidence
- `fabricEventBridge.ts:handleObjectModified:entry` 首次记录 `targetType = activeselection`，说明多选变换确实走到了组回调。
- 同一时间段紧接着出现大量重复的 `handleObjectModified:entry`，且 `activeIds` 变空，说明在回调内部触发了递归/重入。
- `handleObjectModified:beforeDiscard` 首条日志中组内对象存在，随后连续多条 `objects: []`，说明组在当前事件周期里被提前拆散。
- `FabricStage.tsx:renderCycle` 在 `selection.length = 2` 时直接得到 `shouldRebuildSelection = true`。
- `FabricStage.tsx:selectionSyncDecision` 在 `selectionKey === lastSelectionKey` 的情况下仍然 `needsSelectionSync = true`，因为当前逻辑把“多选”本身当成重建条件。

## Verification Conclusion
- 根因是双重干扰：
  1. 在 `object:modified` 回调里同步 `discardActiveObject()`，破坏了 Fabric 对多选拖拽的结束流程。
  2. `FabricStage` 只要看到多选就会重建 `ActiveSelection`，条件过宽，放大了上述异常。
- 用户在修复后复测确认：不再出现“只有框能动、节点不动”。
- 新现象：多选节点后节点出现位置偏移，取消全部勾选后又恢复原位；当前继续调试，暂不清理。
- 用户再次复测确认：多选节点时不再发生位置偏移。
