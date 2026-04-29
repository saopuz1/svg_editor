import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActiveSelection, Canvas, FabricObject, Shadow } from 'fabric';
import type { Editor } from '../../kernel/createEditor';
import {
  bindFabricCoreEvents,
  bindFabricToolEvents,
} from '../../rendering/fabric/fabricEventBridge';
import { buildDocumentFromSvgImport } from '../../rendering/fabric/fabricImportExport';
import {
  createFabricObject,
  applyNodeToObject,
  setObjectNodeId,
} from '../../rendering/fabric/fabricProjection';
import type { DocumentState, NodeId } from '../data/types';
import { serializeDocument } from '../data/serialization';
import { createCommand } from '../edit/commands';
import type { ToolId } from '../edit/tools';
import type { ViewState } from './viewState';

export interface FabricStageApi {
  exportSvg(): string;
  exportJson(): string;
  importSvg(svg: string): Promise<void>;
}

const SELECTED_SHADOW = new Shadow({
  color: 'rgba(37, 99, 235, 0.32)',
  blur: 18,
  offsetX: 0,
  offsetY: 0,
});

function applySelectionAppearance(obj: FabricObject, selected: boolean) {
  obj.set({
    shadow: selected ? SELECTED_SHADOW : null,
    borderColor: '#2563eb',
    cornerColor: '#ffffff',
    cornerStrokeColor: '#2563eb',
    cornerStyle: 'circle',
    transparentCorners: false,
    borderScaleFactor: 1.5,
    cornerSize: 10,
    padding: selected ? 8 : 6,
  });
}

function applyActiveSelectionAppearance(selection: ActiveSelection) {
  selection.set({
    borderColor: '#2563eb',
    cornerColor: '#ffffff',
    cornerStrokeColor: '#2563eb',
    cornerStyle: 'circle',
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
      return typeof record.__editorNodeId === 'string' ? record.__editorNodeId : null;
    })
    .filter((id): id is string => Boolean(id));
}

export const FabricStage = forwardRef<
  FabricStageApi,
  {
    editor: Editor;
    document: DocumentState;
    selection: NodeId[];
    activeToolId: ToolId;
    viewState: ViewState;
  }
>(function FabricStage({ editor, document, selection, activeToolId, viewState }, ref) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const objectMapRef = useRef<Map<NodeId, FabricObject>>(new Map());
  const lastSelectionRef = useRef<string>('');
  const suppressSelectionSyncRef = useRef(false);
  const [ready, setReady] = useState(false);

  const canvasSize = useMemo(
    () => ({ width: document.canvas.width, height: document.canvas.height }),
    [document.canvas.height, document.canvas.width],
  );

  useImperativeHandle(
    ref,
    () => ({
      exportSvg() {
        const canvas = fabricRef.current;
        if (!canvas) return '';
        return canvas.toSVG();
      },
      exportJson() {
        return serializeDocument(editor.data.getState());
      },
      async importSvg(svg: string) {
        const next = await buildDocumentFromSvgImport(editor.data.getState(), svg);
        editor.edit.execute(createCommand('加载文档', { document: next }), '导入 SVG');
      },
    }),
    [editor],
  );

  useEffect(() => {
    if (!canvasElRef.current) return;

    const canvas = new Canvas(canvasElRef.current, {
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selection: true,
      selectionColor: 'rgba(37, 99, 235, 0.08)',
      selectionBorderColor: 'rgba(37, 99, 235, 0.9)',
      selectionLineWidth: 1.5,
    });

    canvas.setDimensions(canvasSize);
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

    return () => {
      unbindCoreEvents();
      canvas.dispose();
      fabricRef.current = null;
      objectMapRef.current.clear();
    };
  }, [canvasSize, editor]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    const selectionKey = selection.join(',');
    const canvasSelectionIds = getCanvasSelectionIds(canvas);
    const canvasSelectionKey = canvasSelectionIds.join(',');
    const shouldRebuildSelection = selectionKey !== canvasSelectionKey;

    if (shouldRebuildSelection) {
      suppressSelectionSyncRef.current = true;
      canvas.discardActiveObject();
      suppressSelectionSyncRef.current = false;
    }

    canvas.setDimensions(canvasSize);
    canvas.set({ backgroundColor: document.canvas.backgroundColor });

    // This app currently does not support pan/zoom.
    // If viewportTransform is changed (e.g. by imported SVG options or Fabric internals),
    // objects may exist but be outside the visible viewport, appearing as a "white screen".
    const vt = (canvas as unknown as { viewportTransform?: unknown })
      .viewportTransform;
    if (
      Array.isArray(vt) &&
      vt.length >= 6 &&
      (vt[0] !== 1 || vt[1] !== 0 || vt[2] !== 0 || vt[3] !== 1 || vt[4] !== 0 || vt[5] !== 0)
    ) {
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    }

    const objectMap = objectMapRef.current;
    const selectedIds = new Set(selection);

    for (const [id, obj] of objectMap.entries()) {
      if (!document.scene.nodes[id]) {
        canvas.remove(obj);
        objectMap.delete(id);
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
        applyNodeToObject(node, existing, viewState, {
          preserveTransform: preserveGroupedTransform,
        });
        applySelectionAppearance(existing, selectedIds.has(id));
        existing.setCoords();
      } else {
        const obj = createFabricObject(node);
        setObjectNodeId(obj, id);
        applyNodeToObject(node, obj, viewState);
        applySelectionAppearance(obj, selectedIds.has(id));
        obj.setCoords();
        objectMap.set(id, obj);
        canvas.add(obj);
      }
    }

    for (const id of document.scene.order) {
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
        .filter((o): o is FabricObject => Boolean(o));

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
    <div style={{ position: 'relative' }}>
      <canvas ref={canvasElRef} className="fabricCanvas" />
    </div>
  );
});
