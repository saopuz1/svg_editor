import { Textbox, type Canvas, type FabricObject } from "fabric";
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
}

export interface FabricToolBridgeOptions {
  canvas: Canvas;
  editor: Editor;
  activeToolId: ToolId;
}

export function bindFabricCoreEvents({
  canvas,
  editor,
  getLastSelectionKey,
  setLastSelectionKey,
}: FabricCoreBridgeOptions) {
  const syncSelection = () => {
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
    if (!obj) return;
    const nodeId = getNodeIdFromObject(obj);
    if (!nodeId) return;

    const patch = readTransformFromObject(obj);
    editor.edit.execute(
      createCommand("更新图形属性", { nodeId, patch }),
      "变换",
    );
  };

  const handleTextEditingExited = (evt: { target?: FabricObject }) => {
    const obj = evt.target;
    if (!obj) return;
    const nodeId = getNodeIdFromObject(obj);
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
}: FabricToolBridgeOptions) {
  const controller = editor.toolRegistry.get(activeToolId);
  if (!controller) {
    canvas.defaultCursor = "default";
    canvas.isDrawingMode = false;
    canvas.skipTargetFind = false;
    canvas.selection = true;
    return () => undefined;
  }

  return controller.activate({ canvas, editor });
}
