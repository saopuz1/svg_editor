import type { ToolId, EditorTool } from "./tools";

export const CANCEL_ACTIVE_DRAWING_EVENT = "editor:cancel-active-drawing";

export type ShortcutAction =
  | { type: "undo" }
  | { type: "delete-selection" }
  | { type: "cancel-active-drawing" }
  | { type: "activate-tool"; toolId: ToolId };

export function shouldIgnoreGlobalShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  return target.isContentEditable;
}

export function resolveShortcutAction(args: {
  event: KeyboardEvent;
  tools: EditorTool[];
  selectionCount: number;
}): ShortcutAction | null {
  const { event, tools, selectionCount } = args;
  const key = event.key.toLowerCase();

  const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && key === "z";
  if (isUndo) {
    return { type: "undo" };
  }

  if (key === "escape") {
    return { type: "cancel-active-drawing" };
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    const matchedTool = tools.find((tool) => tool.shortcut?.toLowerCase() === key);
    if (matchedTool) {
      return { type: "activate-tool", toolId: matchedTool.id as ToolId };
    }
  }

  const isDelete = event.key === "Delete" || event.key === "Backspace";
  if (isDelete && selectionCount > 0) {
    return { type: "delete-selection" };
  }

  return null;
}
