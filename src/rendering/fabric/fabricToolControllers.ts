import { Path, PencilBrush, type FabricObject } from "fabric";
import type {
  ToolController,
  ToolControllerContext,
  ToolControllerRegistry,
} from "../../layers/edit/toolController";
import { createCommand, createTextboxNode } from "../../layers/edit/commands";
import { createPathNodeFromFabricPath, ensureNumber } from "./fabricProjection";

type FabricMouseDownEvent = {
  target?: FabricObject;
  scenePoint?: { x?: unknown; y?: unknown };
};

type FabricPathCreatedEvent = {
  path?: FabricObject;
};

function createSelectionToolController(
  id: "select-box" | "select-lasso" | "select-controls",
  cursor: "default" | "crosshair",
): ToolController {
  return {
    id,
    activate({ canvas }: ToolControllerContext) {
      canvas.defaultCursor = cursor;
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.skipTargetFind = false;

      return () => {
        canvas.isDrawingMode = false;
        canvas.skipTargetFind = false;
        canvas.selection = true;
      };
    },
  };
}

const drawTextToolController: ToolController = {
  id: "draw-text",
  activate({ canvas, editor }: ToolControllerContext) {
    canvas.defaultCursor = "text";
    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.skipTargetFind = true;

    const onMouseDown = (opt: FabricMouseDownEvent) => {
      if (opt.target) return;

      const point = opt.scenePoint;
      const left = ensureNumber(point?.x, 120);
      const top = ensureNumber(point?.y, 120);

      const node = createTextboxNode({ left, top });
      editor.edit.execute(createCommand("新增节点", { node }), "创建文本");
    };

    canvas.on("mouse:down", onMouseDown);

    return () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.isDrawingMode = false;
      canvas.skipTargetFind = false;
      canvas.selection = true;
    };
  },
};

const drawPathToolController: ToolController = {
  id: "draw-path",
  activate({ canvas, editor }: ToolControllerContext) {
    canvas.defaultCursor = "crosshair";
    canvas.selection = false;
    canvas.skipTargetFind = true;
    canvas.isDrawingMode = true;

    const brush = new PencilBrush(canvas);
    brush.width = 2;
    brush.color = "#111827";
    canvas.freeDrawingBrush = brush;

    const onPathCreated = (opt: FabricPathCreatedEvent) => {
      const path = opt.path;
      if (!(path instanceof Path)) return;

      const node = createPathNodeFromFabricPath(
        path,
        editor.data.getState().scene.order.length,
      );
      canvas.remove(path);
      editor.edit.execute(createCommand("新增节点", { node }), "创建曲线");
    };

    canvas.on("path:created", onPathCreated);

    return () => {
      canvas.off("path:created", onPathCreated);
      canvas.isDrawingMode = false;
      canvas.skipTargetFind = false;
      canvas.selection = true;
    };
  },
};

export function registerDefaultFabricToolControllers(
  registry: ToolControllerRegistry,
) {
  registry.register(createSelectionToolController("select-box", "default"));
  registry.register(createSelectionToolController("select-lasso", "crosshair"));
  registry.register(
    createSelectionToolController("select-controls", "default"),
  );
  registry.register(drawTextToolController);
  registry.register(drawPathToolController);
}
