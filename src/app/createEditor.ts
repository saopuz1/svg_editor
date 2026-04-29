/**
 * 兼容层：
 * - 现阶段保留 `src/app/createEditor.ts` 这个旧入口，避免一次性改动全部 import
 * - 真正的内核装配已迁移到 `src/kernel/createEditor.ts`
 */
export type { Editor, EditorKernel } from "../kernel/createEditor";
export { createEditor } from "../kernel/createEditor";
