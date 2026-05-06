import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActiveSelection,
  Canvas,
  FabricObject,
  Point,
  Shadow,
  StaticCanvas,
} from "fabric";
import type { Editor } from "../../kernel/createEditor";
import {
  bindFabricCoreEvents,
  bindFabricToolEvents,
} from "../../rendering/fabric/fabricEventBridge";
import { buildDocumentFromSvgImport } from "../../rendering/fabric/fabricImportExport";
import {
  applyNodeToObject,
  applyAnnotationBackgroundToTextNode,
  createAnnotationBackgroundObject,
  createFabricObject,
  getAnnotationBackgroundShape,
  setObjectNodeId,
} from "../../rendering/fabric/fabricProjection";
import type { DocumentState, NodeId } from "../data/types";
import { serializeDocument } from "../data/serialization";
import { createCommand } from "../edit/commands";
import type { ToolId } from "../edit/tools";
import type { ViewState } from "./viewState";

export interface FabricStageApi {
  exportSvg(): string;
  exportJson(): string;
  importSvg(svg: string): Promise<void>;
}

export type FabricViewportTransform = [
  number,
  number,
  number,
  number,
  number,
  number,
];

const SELECTED_SHADOW = new Shadow({
  color: "rgba(37, 99, 235, 0.32)",
  blur: 18,
  offsetX: 0,
  offsetY: 0,
});

function applySelectionAppearance(obj: FabricObject, selected: boolean) {
  obj.set({
    shadow: selected ? SELECTED_SHADOW : null,
    borderColor: "#2563eb",
    cornerColor: "#ffffff",
    cornerStrokeColor: "#2563eb",
    cornerStyle: "circle",
    transparentCorners: false,
    borderScaleFactor: 1.5,
    cornerSize: 10,
    padding: selected ? 8 : 6,
  });
}

function applyActiveSelectionAppearance(selection: ActiveSelection) {
  selection.set({
    borderColor: "#2563eb",
    cornerColor: "#ffffff",
    cornerStrokeColor: "#2563eb",
    cornerStyle: "circle",
    transparentCorners: false,
    borderScaleFactor: 1.5,
    cornerSize: 10,
    padding: 8,
  });
}

function getCanvasSelectionIds(canvas: Canvas) {
  return canvas
    .getActiveObjects()
    .map((obj) => {
      const record = obj as FabricObject & { __editorNodeId?: unknown };
      return typeof record.__editorNodeId === "string"
        ? record.__editorNodeId
        : null;
    })
    .filter((id): id is string => Boolean(id));
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
const ZOOM_SENSITIVITY = 0.999;

function isPanGesture(evt: MouseEvent) {
  return evt.button === 1;
}

function isMacZoomGesture(evt: WheelEvent) {
  const platform = globalThis.navigator?.platform ?? "";
  const userAgent = globalThis.navigator?.userAgent ?? "";
  const isMacPlatform = /Mac|iPhone|iPad|iPod/i.test(platform + userAgent);
  return isMacPlatform ? evt.metaKey : evt.ctrlKey;
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function cloneViewportTransform(
  transform: FabricViewportTransform,
): FabricViewportTransform {
  return [...transform] as FabricViewportTransform;
}

function asMouseEvent(evt: Event | undefined): MouseEvent | null {
  if (!(evt instanceof MouseEvent)) return null;
  return evt;
}

function asWheelEvent(evt: Event | undefined): WheelEvent | null {
  if (!(evt instanceof WheelEvent)) return null;
  return evt;
}

type FabricMouseWheelEvent = {
  e?: Event;
  viewportPoint?: Point;
};

function buildExportSvg(document: DocumentState, viewState: ViewState) {
  const exportEl = globalThis.document.createElement("canvas");
  const exportCanvas = new StaticCanvas(exportEl, {
    backgroundColor: document.canvas.backgroundColor || "#ffffff",
    preserveObjectStacking: true,
  });

  exportCanvas.setDimensions({
    width: document.canvas.width,
    height: document.canvas.height,
  });

  for (const id of document.scene.order) {
    const node = document.scene.nodes[id];
    if (!node) continue;

    const obj = createFabricObject(node);
    setObjectNodeId(obj, id);
    applyNodeToObject(
      node,
      obj,
      viewState,
      undefined,
      document.domain.标注样式,
    );

    if (obj.type === "textbox" || obj.type === "text") {
      const shape = getAnnotationBackgroundShape(
        node,
        document.domain.标注样式,
      );
      if (shape) {
        const background = createAnnotationBackgroundObject(shape, {
          excludeFromExport: false,
        });
        applyAnnotationBackgroundToTextNode(
          node,
          obj as never,
          background,
          document.domain.标注样式,
          (obj as FabricObject & { visible?: boolean }).visible !== false,
        );
        exportCanvas.add(background);
      }
    }

    exportCanvas.add(obj);
  }

  const svg = exportCanvas.toSVG();
  exportCanvas.dispose();
  return svg;
}

export const FabricStage = forwardRef<
  FabricStageApi,
  {
    editor: Editor;
    document: DocumentState;
    selection: NodeId[];
    activeToolId: ToolId;
    viewState: ViewState;
    businessCommandActive?: boolean;
    onViewportTransformChange?: (transform: FabricViewportTransform) => void;
  }
>(function FabricStage(
  {
    editor,
    document,
    selection,
    activeToolId,
    viewState,
    businessCommandActive = false,
    onViewportTransformChange,
  },
  ref,
) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const objectMapRef = useRef<Map<NodeId, FabricObject>>(new Map());
  const backgroundMapRef = useRef<Map<NodeId, FabricObject>>(new Map());
  const lastSelectionRef = useRef<string>("");
  const suppressSelectionSyncRef = useRef(false);
  const viewportTransformRef = useRef<FabricViewportTransform>([
    1, 0, 0, 1, 0, 0,
  ]);
  const panningRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
    selection: boolean;
    skipTargetFind: boolean;
    defaultCursor: string;
    hoverCursor: string | null;
    moveCursor: string | null;
  }>({
    active: false,
    lastX: 0,
    lastY: 0,
    selection: true,
    skipTargetFind: false,
    defaultCursor: "default",
    hoverCursor: null,
    moveCursor: null,
  });
  const [ready, setReady] = useState(false);

  const canvasSize = useMemo(
    () => ({ width: document.canvas.width, height: document.canvas.height }),
    [document.canvas.height, document.canvas.width],
  );

  useImperativeHandle(
    ref,
    () => ({
      exportSvg() {
        return buildExportSvg(document, viewState);
      },
      exportJson() {
        return serializeDocument(editor.data.getState());
      },
      async importSvg(svg: string) {
        const next = await buildDocumentFromSvgImport(
          editor.data.getState(),
          svg,
        );
        editor.edit.execute(
          createCommand("加载文档", { document: next }),
          "导入 SVG",
        );
      },
    }),
    [document, editor, viewState],
  );

  useEffect(() => {
    if (!canvasElRef.current) return;

    const canvas = new Canvas(canvasElRef.current, {
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selection: !businessCommandActive,
      selectionColor: "rgba(37, 99, 235, 0.08)",
      selectionBorderColor: "rgba(37, 99, 235, 0.9)",
      selectionLineWidth: 1.5,
      skipTargetFind: businessCommandActive,
    });

    // setDimensions 只放大了 backstore（canvas.width/height 属性乘以 DPR），
    // 但不会自动设置 CSS 显示尺寸。若不补设，浏览器会用放大后的像素值决定
    // 显示大小（例如 2400px），导致画布看起来模糊或溢出。
    // 需要用 cssOnly 选项把 CSS 尺寸固定到逻辑尺寸（W×H px）。
    canvas.setDimensions(canvasSize);
    canvas.setDimensions(
      { width: `${canvasSize.width}px`, height: `${canvasSize.height}px` },
      { cssOnly: true },
    );
    canvas.setViewportTransform(
      cloneViewportTransform(viewportTransformRef.current),
    );
    onViewportTransformChange?.(
      cloneViewportTransform(viewportTransformRef.current),
    );
    canvas.uniformScaling = false;
    fabricRef.current = canvas;
    setReady(true);

    const unbindCoreEvents = bindFabricCoreEvents({
      canvas,
      editor,
      getLastSelectionKey: () => lastSelectionRef.current,
      setLastSelectionKey: (key) => {
        lastSelectionRef.current = key;
      },
      isSelectionSyncSuppressed: () => suppressSelectionSyncRef.current,
    });

    const handleMouseDown = (evt: { e?: Event }) => {
      const nativeEvent = asMouseEvent(evt.e);
      if (!nativeEvent || !isPanGesture(nativeEvent)) return;

      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      panningRef.current = {
        active: true,
        lastX: nativeEvent.clientX,
        lastY: nativeEvent.clientY,
        selection: canvas.selection,
        skipTargetFind: canvas.skipTargetFind,
        defaultCursor: canvas.defaultCursor,
        hoverCursor: canvas.hoverCursor ?? null,
        moveCursor: canvas.moveCursor ?? null,
      };
      canvas.selection = false;
      canvas.skipTargetFind = true;
      canvas.defaultCursor = "grabbing";
      canvas.hoverCursor = "grabbing";
      canvas.moveCursor = "grabbing";
      canvas.setCursor("grabbing");
    };

    const handleMouseMove = (evt: { e?: Event }) => {
      const nativeEvent = asMouseEvent(evt.e);
      if (!nativeEvent || !panningRef.current.active) return;

      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      const dx = nativeEvent.clientX - panningRef.current.lastX;
      const dy = nativeEvent.clientY - panningRef.current.lastY;
      panningRef.current.lastX = nativeEvent.clientX;
      panningRef.current.lastY = nativeEvent.clientY;

      const next = cloneViewportTransform(viewportTransformRef.current);
      next[4] += dx;
      next[5] += dy;
      viewportTransformRef.current = next;
      canvas.setViewportTransform(next);
      onViewportTransformChange?.(cloneViewportTransform(next));
      canvas.requestRenderAll();
    };

    const handleMouseWheel = (evt: FabricMouseWheelEvent) => {
      const nativeEvent = asWheelEvent(evt.e);
      if (!nativeEvent || !isMacZoomGesture(nativeEvent)) return;

      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();

      const nextZoom = clampZoom(
        canvas.getZoom() * Math.pow(ZOOM_SENSITIVITY, nativeEvent.deltaY),
      );
      const zoomPoint =
        evt.viewportPoint ??
        new Point(nativeEvent.offsetX, nativeEvent.offsetY);
      canvas.zoomToPoint(zoomPoint, nextZoom);
      viewportTransformRef.current = cloneViewportTransform(
        canvas.viewportTransform as FabricViewportTransform,
      );
      onViewportTransformChange?.(
        cloneViewportTransform(viewportTransformRef.current),
      );
      canvas.requestRenderAll();
    };

    const stopPanning = () => {
      if (!panningRef.current.active) return;
      const previous = panningRef.current;
      panningRef.current = {
        ...previous,
        active: false,
      };
      canvas.selection = previous.selection;
      canvas.skipTargetFind = previous.skipTargetFind;
      canvas.defaultCursor = previous.defaultCursor;
      canvas.hoverCursor = previous.hoverCursor ?? previous.defaultCursor;
      canvas.moveCursor = previous.moveCursor ?? previous.defaultCursor;
      canvas.setCursor(previous.defaultCursor);
    };

    const preventMiddleAutoScroll = (evt: MouseEvent) => {
      if (!isPanGesture(evt)) return;
      evt.preventDefault();
    };

    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:wheel", handleMouseWheel);
    canvas.on("mouse:up", stopPanning);
    window.addEventListener("mouseup", stopPanning);
    canvas.upperCanvasEl.addEventListener("mousedown", preventMiddleAutoScroll);
    canvas.upperCanvasEl.addEventListener("auxclick", preventMiddleAutoScroll);

    return () => {
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:wheel", handleMouseWheel);
      canvas.off("mouse:up", stopPanning);
      window.removeEventListener("mouseup", stopPanning);
      canvas.upperCanvasEl.removeEventListener(
        "mousedown",
        preventMiddleAutoScroll,
      );
      canvas.upperCanvasEl.removeEventListener(
        "auxclick",
        preventMiddleAutoScroll,
      );
      unbindCoreEvents();
      canvas.dispose();
      fabricRef.current = null;
      objectMapRef.current.clear();
      backgroundMapRef.current.clear();
    };
  }, [canvasSize, editor, onViewportTransformChange]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    const selectionKey = selection.join(",");
    const canvasSelectionIds = getCanvasSelectionIds(canvas);
    const canvasSelectionKey = canvasSelectionIds.join(",");
    const shouldRebuildSelection = selectionKey !== canvasSelectionKey;

    if (shouldRebuildSelection) {
      suppressSelectionSyncRef.current = true;
      canvas.discardActiveObject();
      suppressSelectionSyncRef.current = false;
    }

    canvas.setDimensions(canvasSize);
    // 同步 CSS 尺寸到逻辑尺寸，防止 retina 放大后画布显示模糊
    canvas.setDimensions(
      { width: `${canvasSize.width}px`, height: `${canvasSize.height}px` },
      { cssOnly: true },
    );
    canvas.set({ backgroundColor: document.canvas.backgroundColor });
    canvas.setViewportTransform(
      cloneViewportTransform(viewportTransformRef.current),
    );

    const objectMap = objectMapRef.current;
    const backgroundMap = backgroundMapRef.current;
    const selectedIds = new Set(selection);

    for (const [id, obj] of objectMap.entries()) {
      if (!document.scene.nodes[id]) {
        canvas.remove(obj);
        objectMap.delete(id);
      }
    }

    for (const [id, obj] of backgroundMap.entries()) {
      const node = document.scene.nodes[id];
      if (
        !node ||
        (node.fabricObject.type !== "textbox" &&
          node.fabricObject.type !== "text")
      ) {
        canvas.remove(obj);
        backgroundMap.delete(id);
      }
    }

    for (const id of document.scene.order) {
      const node = document.scene.nodes[id];
      if (!node) continue;

      const existing = objectMap.get(id);
      if (existing) {
        const preserveGroupedTransform =
          selectedIds.has(id) &&
          activeObject instanceof ActiveSelection &&
          !shouldRebuildSelection;
        applyNodeToObject(
          node,
          existing,
          viewState,
          {
            preserveTransform: preserveGroupedTransform,
          },
          document.domain.标注样式,
        );
        applySelectionAppearance(existing, selectedIds.has(id));
        existing.setCoords();
      } else {
        const obj = createFabricObject(node);
        setObjectNodeId(obj, id);
        applyNodeToObject(
          node,
          obj,
          viewState,
          undefined,
          document.domain.标注样式,
        );
        applySelectionAppearance(obj, selectedIds.has(id));
        obj.setCoords();
        objectMap.set(id, obj);
        canvas.add(obj);
      }

      const currentObject = objectMap.get(id);
      if (currentObject?.type === "textbox" || currentObject?.type === "text") {
        const desiredShape = getAnnotationBackgroundShape(
          node,
          document.domain.标注样式,
        );
        const existingBackground = backgroundMap.get(id);

        if (!desiredShape) {
          if (existingBackground) {
            canvas.remove(existingBackground);
            backgroundMap.delete(id);
          }
        } else {
          const currentType = existingBackground?.type;
          const matchesShape =
            (desiredShape === "rect" && currentType === "rect") ||
            (desiredShape === "ellipse" && currentType === "ellipse");
          const background =
            existingBackground && matchesShape
              ? existingBackground
              : createAnnotationBackgroundObject(desiredShape);

          if (!existingBackground || !matchesShape) {
            if (existingBackground) {
              canvas.remove(existingBackground);
            }
            backgroundMap.set(id, background);
            canvas.add(background);
          }

          applyAnnotationBackgroundToTextNode(
            node,
            currentObject as never,
            background,
            document.domain.标注样式,
            (currentObject as FabricObject & { visible?: boolean }).visible !==
              false,
          );
          background.setCoords();
        }
      } else {
        const existingBackground = backgroundMap.get(id);
        if (existingBackground) {
          canvas.remove(existingBackground);
          backgroundMap.delete(id);
        }
      }
    }

    for (const id of document.scene.order) {
      const background = backgroundMap.get(id);
      if (background) {
        canvas.bringObjectToFront(background);
      }
      const obj = objectMap.get(id);
      if (!obj) continue;
      canvas.bringObjectToFront(obj);
    }

    const needsSelectionSync =
      selectionKey !== lastSelectionRef.current || shouldRebuildSelection;
    if (needsSelectionSync) {
      lastSelectionRef.current = selectionKey;

      suppressSelectionSyncRef.current = true;
      canvas.discardActiveObject();
      const selected = selection
        .map((id) => objectMap.get(id))
        .filter(
          (o): o is FabricObject =>
            Boolean(o) &&
            (o as FabricObject & { visible?: boolean }).visible !== false,
        );

      if (selected.length === 1) {
        canvas.setActiveObject(selected[0]);
      } else if (selected.length > 1) {
        const activeSelection = new ActiveSelection(selected, { canvas });
        applyActiveSelectionAppearance(activeSelection);
        canvas.setActiveObject(activeSelection);
      }
      suppressSelectionSyncRef.current = false;
    }

    // Force a sync render to avoid cases where RAF scheduling is dropped.
    canvas.renderAll();
  }, [canvasSize, document, selection, viewState]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    return bindFabricToolEvents({
      canvas,
      editor,
      activeToolId,
    });
  }, [activeToolId, editor]);

  // ready 仅用于外层展示状态，可保留以避免 lint 报 unused
  void ready;

  return (
    <div style={{ position: "relative" }}>
      <canvas ref={canvasElRef} className="fabricCanvas" />
    </div>
  );
});
