# Debug Session: fabric-blank-canvas

Status: [OPEN]

## Symptom

- SVG/已有 scene 数据存在，但 Fabric 画布白屏。
- 自由绘制时预览可见，结束后持久对象不显示。

## Scope

- Runtime rendering path
- Scene -> Fabric object reconstruction
- Visibility / viewport / object lifecycle

## Hypotheses

1. `scene` 中对象已存在，但 `FabricStage` 没有真正把对象 add 到 canvas。
2. 对象 add 成功，但 `visible / opacity / selectable / evented / zIndex` 等状态被覆盖成不可见。
3. 对象实例存在，但 `createFabricObject()` 对 `fabricObject.type/path/text` 的还原不正确，生成了空对象。
4. 对象已存在于 canvas，但 `viewportTransform / dimensions / wrapper sizing` 让内容落在可视区域外。
5. `path:created` 后临时对象被删掉了，但持久化节点重建失败，所以只在绘制过程可见。

## Plan

1. 先只加运行时埋点，不改业务逻辑。
2. 收集导入后 / 绘制后 / 同步渲染阶段的对象数量、首对象类型、关键 geometry。
3. 根据证据确认是“未 add / add 了但不可见 / 重建错误 / 视口错误”中的哪一类。
4. 再做最小修复并进行前后对比验证。
