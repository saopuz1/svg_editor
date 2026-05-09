import {
  ActiveSelection,
  Textbox,
  type Canvas,
  type FabricObject,
} from "fabric";
import type { Editor } from "../../kernel/createEditor";
import { createCommand } from "../../layers/edit/commands";
import type { ToolId } from "../../layers/edit/tools";
import type { NodeId } from "../../layers/data/types";
import {
  getNodeIdFromObject,
  readTransformFromObject,
} from "./fabricProjection";

export interface FabricCoreBridgeOptions {
  canvas: Canvas;
  editor: Editor;
  getLastSelectionKey: () => string;
  setLastSelectionKey: (key: string) => void;
  /**
   * When true, selection events from Fabric will be ignored.
   * This is used to avoid feedback loops when we programmatically
   * rebuild selections (e.g. recreate ActiveSelection).
   */
  isSelectionSyncSuppressed?: () => boolean;
  shouldHandleCoreDocumentEdits?: () => boolean;
}

export interface FabricToolBridgeOptions {
  canvas: Canvas;
  editor: Editor;
  activeToolId: ToolId;
  onSelectLassoGesture?: (points: Array<{ x: number; y: number }>) => boolean;
}

export function bindFabricCoreEvents({
  canvas,
  editor,
  getLastSelectionKey,
  setLastSelectionKey,
  isSelectionSyncSuppressed,
  shouldHandleCoreDocumentEdits,
}: FabricCoreBridgeOptions) {
  let internalSuppressSelectionSync = false;
  let pendingMultiTransformPersist = false;
  const isSuppressed = () =>
    internalSuppressSelectionSync || isSelectionSyncSuppressed?.() === true;
  const canHandleCoreDocumentEdits = () =>
    shouldHandleCoreDocumentEdits?.() !== false;

  const syncSelection = () => {
    if (isSuppressed() || !canHandleCoreDocumentEdits()) return;
    const active = canvas.getActiveObjects();
    const ids = active
      .map((obj) => getNodeIdFromObject(obj))
      .filter((id): id is NodeId => Boolean(id));

    const key = ids.join(",");
    if (key === getLastSelectionKey()) return;
    setLastSelectionKey(key);

    editor.edit.act({ type: "SET_SELECTION", payload: { nodeIds: ids } });
  };

  const handleObjectModified = (evt: { target?: FabricObject }) => {
    const obj = evt.target;
    if (!obj || !canHandleCoreDocumentEdits()) return;
    if (obj instanceof ActiveSelection) {
      if (pendingMultiTransformPersist) return;
      pendingMultiTransformPersist = true;
      const selectedObjects = obj.getObjects().slice();

      window.setTimeout(() => {
        try {
          // Apply the selection transform after Fabric finishes the current event cycle.
          // Doing this synchronously inside object:modified re-enters ActiveSelection logic
          // and leaves behind a transient selection frame.
          internalSuppressSelectionSync = true;
          canvas.discardActiveObject();
          setLastSelectionKey("");
          internalSuppressSelectionSync = false;

          const patches = selectedObjects
            .map((item) => {
              const nodeId = getNodeIdFromObject(item);
              if (!nodeId) return null;
              return { nodeId, patch: readTransformFromObject(item) };
            })
            .filter(
              (
                item,
              ): item is {
                nodeId: NodeId;
                patch: ReturnType<typeof readTransformFromObject>;
              } => Boolean(item),
            );

          if (patches.length === 0) return;
          editor.edit.execute(
            createCommand("批量更新图形属性", { patches }),
            "变换",
          );
        } finally {
          internalSuppressSelectionSync = false;
          pendingMultiTransformPersist = false;
        }
      }, 0);
      return;
    }

    const nodeId = getNodeIdFromObject(obj);
    if (!nodeId) return;
    editor.edit.execute(
      createCommand("更新图形属性", {
        nodeId,
        patch: readTransformFromObject(obj),
      }),
      "变换",
    );
  };

  const handleTextEditingExited = (evt: { target?: FabricObject }) => {
    const obj = evt.target;
    if (!obj || !canHandleCoreDocumentEdits()) return;
    const nodeId =
      getNodeIdFromObject(obj) ??
      getNodeIdFromObject(
        (obj as unknown as { group?: unknown }).group as never,
      );
    if (!nodeId) return;
    if (!(obj instanceof Textbox)) return;

    editor.edit.execute(
      createCommand("更新图形属性", {
        nodeId,
        patch: { text: obj.text ?? "" },
      }),
      "编辑文本",
    );
  };

  canvas.on("selection:created", syncSelection);
  canvas.on("selection:updated", syncSelection);
  canvas.on("selection:cleared", syncSelection);
  canvas.on("object:modified", handleObjectModified);
  canvas.on("text:editing:exited", handleTextEditingExited);

  return () => {
    canvas.off("selection:created", syncSelection);
    canvas.off("selection:updated", syncSelection);
    canvas.off("selection:cleared", syncSelection);
    canvas.off("object:modified", handleObjectModified);
    canvas.off("text:editing:exited", handleTextEditingExited);
  };
}

export function bindFabricToolEvents({
  canvas,
  editor,
  activeToolId,
  onSelectLassoGesture,
}: FabricToolBridgeOptions) {
  const controller = editor.toolRegistry.get(activeToolId);
  if (!controller) {
    canvas.defaultCursor = "default";
    canvas.isDrawingMode = false;
    canvas.skipTargetFind = false;
    canvas.selection = true;
    return () => undefined;
  }

  return controller.activate({ canvas, editor, onSelectLassoGesture });
}
