import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActiveSelection, Canvas, FabricObject } from 'fabric';
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
        // #region debug-point A:import-svg
        fetch('http://127.0.0.1:7777/event', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: 'svg-import-draw-blank',
            runId: 'pre-fix',
            hypothesisId: 'A',
            location: 'FabricStage.importSvg',
            msg: '[DEBUG] importSvg built next document',
            data: {
              nextOrderLen: next.order.length,
              nextNodesLen: Object.keys(next.nodes).length,
              canvas: next.canvas,
              svgLen: typeof svg === 'string' ? svg.length : null,
            },
            ts: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
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
    });

    canvas.setDimensions(canvasSize);
    fabricRef.current = canvas;
    setReady(true);
    // #region debug-point B:canvas-init
    fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'svg-import-draw-blank',
        runId: 'pre-fix',
        hypothesisId: 'B',
        location: 'FabricStage.useEffect:init',
        msg: '[DEBUG] fabric canvas initialized',
        data: {
          canvasSize,
          dpr: window.devicePixelRatio,
          selection: canvas.selection,
        },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const unbindCoreEvents = bindFabricCoreEvents({
      canvas,
      editor,
      getLastSelectionKey: () => lastSelectionRef.current,
      setLastSelectionKey: (key) => {
        lastSelectionRef.current = key;
      },
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

    // #region debug-point C:render-sync
    fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'svg-import-draw-blank',
        runId: 'pre-fix',
        hypothesisId: 'C',
        location: 'FabricStage.useEffect:sync',
        msg: '[DEBUG] render sync tick',
        data: {
          docOrderLen: document.order.length,
          docNodesLen: Object.keys(document.nodes).length,
          selectionLen: selection.length,
          canvasObjectsLen: canvas.getObjects().length,
          isDrawingMode: canvas.isDrawingMode,
          skipTargetFind: canvas.skipTargetFind,
        },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    canvas.setDimensions(canvasSize);
    canvas.set({ backgroundColor: document.canvas.backgroundColor });

    const objectMap = objectMapRef.current;

    for (const [id, obj] of objectMap.entries()) {
      if (!document.nodes[id]) {
        canvas.remove(obj);
        objectMap.delete(id);
      }
    }

    for (const id of document.order) {
      const node = document.nodes[id];
      if (!node) continue;

      const existing = objectMap.get(id);
      if (existing) {
        applyNodeToObject(node, existing, viewState);
      } else {
        const obj = createFabricObject(node);
        setObjectNodeId(obj, id);
        applyNodeToObject(node, obj, viewState);
        objectMap.set(id, obj);
        canvas.add(obj);
      }
    }

    for (const id of document.order) {
      const obj = objectMap.get(id);
      if (!obj) continue;
      canvas.bringObjectToFront(obj);
    }

    const selectionKey = selection.join(',');
    if (selectionKey !== lastSelectionRef.current) {
      lastSelectionRef.current = selectionKey;

      canvas.discardActiveObject();
      const selected = selection
        .map((id) => objectMap.get(id))
        .filter((o): o is FabricObject => Boolean(o));

      if (selected.length === 1) {
        canvas.setActiveObject(selected[0]);
      } else if (selected.length > 1) {
        canvas.setActiveObject(new ActiveSelection(selected, { canvas }));
      }
    }

    canvas.requestRenderAll();
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

  return <canvas ref={canvasElRef} className="fabricCanvas" />;
});
