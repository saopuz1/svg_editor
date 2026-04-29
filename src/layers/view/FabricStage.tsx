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
        // #region debug-point A:import-result
        fetch('http://127.0.0.1:7777/event',{method:'POST',body:JSON.stringify({sessionId:'fabric-blank-canvas',runId:'pre-fix',hypothesisId:'A',location:'FabricStage.importSvg',msg:'[DEBUG] svg import built next document',data:{sceneOrderLen:next.scene.order.length,sceneNodeLen:Object.keys(next.scene.nodes).length,firstId:next.scene.order[0] ?? null,firstType:(next.scene.order[0] ? next.scene.nodes[next.scene.order[0]]?.fabricObject.type : null) ?? null,firstLeft:(next.scene.order[0] ? next.scene.nodes[next.scene.order[0]]?.fabricObject.left : null) ?? null,firstTop:(next.scene.order[0] ? next.scene.nodes[next.scene.order[0]]?.fabricObject.top : null) ?? null,svgLen:svg.length},ts:Date.now()})}).catch(()=>{});
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
        applyNodeToObject(node, existing, viewState);
        existing.setCoords();
      } else {
        const obj = createFabricObject(node);
        setObjectNodeId(obj, id);
        applyNodeToObject(node, obj, viewState);
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

    // #region debug-point B:render-sync
    (() => {
      const objects = canvas.getObjects();
      const first = objects[0] as (FabricObject & Record<string, unknown>) | undefined;
      fetch('http://127.0.0.1:7777/event',{method:'POST',body:JSON.stringify({sessionId:'fabric-blank-canvas',runId:'pre-fix',hypothesisId:'B',location:'FabricStage.renderSync',msg:'[DEBUG] fabric stage sync complete',data:{sceneOrderLen:document.scene.order.length,sceneNodeLen:Object.keys(document.scene.nodes).length,objectMapSize:objectMap.size,canvasObjectsLen:objects.length,canvasWidth:canvas.getWidth(),canvasHeight:canvas.getHeight(),activeToolId,firstObject:first ? {type:first.type ?? null,left:first.left ?? null,top:first.top ?? null,width:first.width ?? null,height:first.height ?? null,visible:first.visible ?? null,opacity:first.opacity ?? null,stroke:first.stroke ?? null,fill:first.fill ?? null} : null,viewportTransform:(canvas as unknown as { viewportTransform?: unknown }).viewportTransform ?? null},ts:Date.now()})}).catch(()=>{});
    })();
    // #endregion
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
