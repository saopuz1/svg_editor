import {
  ActiveSelection,
  Circle,
  Polyline,
  type Canvas,
  type FabricObject,
} from "fabric";
import type {
  DocumentState,
  EditorNode,
  NodeId,
} from "../../layers/data/types";
import {
  type ActiveBusinessCommandState,
  buildBusinessCommandPreviewDocument,
} from "../../layers/edit/businessCommandsState";
import { getNodeIdFromObject } from "./fabricProjection";
import {
  findNearbyLines,
  resolveExtractableLineGeometry,
  resolveExtractSelectionHits,
} from "../../layers/businessCommands/extractCarlineGeometry";
import { getAreaColor } from "../../layers/businessCommands/extractCarlinePreview";
import { getGearColor } from "../../layers/businessCommands/markGearPreview";
import { getMarkGearHittableNodeIds } from "../../layers/businessCommands/markGearSession";
import { getMarkOddEvenDoubleNodeIds } from "../../layers/businessCommands/markOddEvenSession";
import {
  toggleCurrentExtractCarlineLines,
  updateExtractCarlineLabelPosition,
} from "../../layers/businessCommands/extractCarlineSession";
import {
  toggleMarkGearLines,
  updateMarkGearLabelPosition,
} from "../../layers/businessCommands/markGearSession";
import {
  toggleMarkOddEvenLines,
  updateMarkOddEvenLabelPosition,
} from "../../layers/businessCommands/markOddEvenSession";

type CanvasPoint = { x: number; y: number };

type LineHighlightInfo = {
  color: string;
  isUsed: boolean;
};

interface BindFabricBusinessCommandEventsOptions {
  canvas: Canvas;
  getDocument: () => DocumentState;
  getRenderDocument: () => DocumentState;
  getBusinessCommand: () => ActiveBusinessCommandState | null;
  activeToolId?: string;
  subscribe?: (listener: () => void) => () => void;
  updateBusinessCommand: (
    updater: (
      current: ActiveBusinessCommandState,
    ) => ActiveBusinessCommandState | null,
  ) => void;
}

const CLICK_HIT_THRESHOLD = 12;
const BRUSH_ACTIVATE_DISTANCE = 6;

function isSelectionToolActive(activeToolId?: string) {
  return activeToolId === "select-box";
}

function buildPreviewLabelMap(
  document: DocumentState,
  state: ActiveBusinessCommandState | null,
) {
  if (!state) return new Map<NodeId, NodeId>();

  const previewDocument = buildBusinessCommandPreviewDocument(document, state);
  const map = new Map<NodeId, NodeId>();
  for (const id of previewDocument.scene.order) {
    const node = previewDocument.scene.nodes[id];
    if (!node || node.business.type !== "标注") continue;
    if (document.scene.nodes[id]) continue;
    map.set(id, node.business.归属车线Id);
  }
  return map;
}

function resolveCandidateNodes(
  document: DocumentState,
  state: ActiveBusinessCommandState | null,
) {
  if (!state) return [] as EditorNode[];

  let candidateIds: ReadonlySet<string>;
  switch (state.kind) {
    case "extract-carline": {
      const ids = new Set<string>();
      for (const id of document.scene.order) {
        const node = document.scene.nodes[id];
        if (
          node &&
          node.business.type !== "车线" &&
          (node.fabricObject.type === "line" ||
            node.fabricObject.type === "path")
        ) {
          ids.add(id);
        }
      }
      candidateIds = ids;
      break;
    }
    case "mark-gear":
      candidateIds = getMarkGearHittableNodeIds(state.session);
      break;
    case "mark-odd-even":
      candidateIds = new Set(state.session.carlineNodeIds);
      break;
  }

  return document.scene.order
    .map((id) => document.scene.nodes[id])
    .filter(
      (node): node is EditorNode =>
        Boolean(node) &&
        candidateIds.has(node.id) &&
        (node.fabricObject.type === "line" ||
          node.fabricObject.type === "path"),
    );
}

function resolveLineHighlightMap(state: ActiveBusinessCommandState | null) {
  const map = new Map<string, LineHighlightInfo>();
  if (!state) return map;

  switch (state.kind) {
    case "extract-carline":
      state.session.completedAreas.forEach((area, index) => {
        const color = getAreaColor(index);
        area.selectedLines.forEach((line) => {
          map.set(line.nodeId, { color, isUsed: true });
        });
      });
      state.session.currentDraft.selectedLines.forEach((line) => {
        map.set(line.nodeId, {
          color: getAreaColor(state.session.completedAreas.length),
          isUsed: false,
        });
      });
      break;
    case "mark-gear":
      for (const gear of state.session.completedGears) {
        const color = getGearColor(gear.gearNumber);
        for (const line of gear.selectedLines) {
          map.set(line.nodeId, { color, isUsed: true });
        }
      }
      for (const line of state.session.currentLines) {
        map.set(line.nodeId, {
          color: getGearColor(state.session.currentGearNumber),
          isUsed: false,
        });
      }
      break;
    case "mark-odd-even": {
      const doubleIds = getMarkOddEvenDoubleNodeIds(state.session);
      for (const id of state.session.carlineNodeIds) {
        map.set(id, {
          color: doubleIds.has(id) ? "#2563eb" : "#6b7280",
          isUsed: false,
        });
      }
      break;
    }
  }

  return map;
}

function resolvePendingHitColor(state: ActiveBusinessCommandState | null) {
  if (!state) return "#2563eb";
  switch (state.kind) {
    case "extract-carline":
      return getAreaColor(state.session.completedAreas.length);
    case "mark-gear":
      return getGearColor(state.session.currentGearNumber);
    case "mark-odd-even":
      return "#2563eb";
  }
}

function updateSessionWithHits(
  state: ActiveBusinessCommandState,
  hits: Array<{ nodeId: string; hitPoint: CanvasPoint; hitOrder: number }>,
) {
  switch (state.kind) {
    case "extract-carline":
      return {
        ...state,
        session: toggleCurrentExtractCarlineLines(state.session, hits),
      } satisfies ActiveBusinessCommandState;
    case "mark-gear":
      return {
        ...state,
        session: toggleMarkGearLines(state.session, hits),
      } satisfies ActiveBusinessCommandState;
    case "mark-odd-even":
      return {
        ...state,
        session: toggleMarkOddEvenLines(state.session, hits),
      } satisfies ActiveBusinessCommandState;
  }
}

export function applyBusinessCommandHits(
  state: ActiveBusinessCommandState,
  hits: Array<{ nodeId: string; hitPoint: CanvasPoint; hitOrder: number }>,
) {
  return updateSessionWithHits(state, hits);
}

function updateSessionLabelPosition(
  state: ActiveBusinessCommandState,
  nodeId: string,
  point: CanvasPoint,
) {
  switch (state.kind) {
    case "extract-carline":
      return {
        ...state,
        session: updateExtractCarlineLabelPosition(
          state.session,
          nodeId,
          point,
        ),
      } satisfies ActiveBusinessCommandState;
    case "mark-gear":
      return {
        ...state,
        session: updateMarkGearLabelPosition(state.session, nodeId, point),
      } satisfies ActiveBusinessCommandState;
    case "mark-odd-even":
      return {
        ...state,
        session: updateMarkOddEvenLabelPosition(state.session, nodeId, point),
      } satisfies ActiveBusinessCommandState;
  }
}

function resolveObjectCanvasPoint(obj: FabricObject): CanvasPoint | null {
  const getCenterPoint = (obj as unknown as { getCenterPoint?: unknown })
    .getCenterPoint;
  if (typeof getCenterPoint === "function") {
    const point = (
      obj as unknown as { getCenterPoint: () => { x?: unknown; y?: unknown } }
    ).getCenterPoint();
    const x = typeof point.x === "number" ? point.x : NaN;
    const y = typeof point.y === "number" ? point.y : NaN;
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }

  if (typeof obj.left !== "number" || typeof obj.top !== "number") return null;
  return { x: obj.left, y: obj.top };
}

function findSingleHit(point: CanvasPoint, nodes: EditorNode[]) {
  const hits = findNearbyLines(point, nodes, CLICK_HIT_THRESHOLD);
  const first = hits[0];
  if (!first) return null;
  return {
    nodeId: first.nodeId,
    hitPoint: first.hitPoint,
    hitOrder: 0,
  };
}

function resolveGeometryAnchor(node: EditorNode): CanvasPoint | null {
  const geometry = resolveExtractableLineGeometry(node);
  if (!geometry || geometry.segments.length === 0) return null;

  let sumX = 0;
  let sumY = 0;
  for (const segment of geometry.segments) {
    sumX += (segment.start.x + segment.end.x) / 2;
    sumY += (segment.start.y + segment.end.y) / 2;
  }

  return {
    x: sumX / geometry.segments.length,
    y: sumY / geometry.segments.length,
  };
}

export function resolveBusinessCommandSelectionHits(
  document: DocumentState,
  state: ActiveBusinessCommandState,
  nodeIds: readonly string[],
) {
  const candidateNodes = resolveCandidateNodes(document, state);
  const candidateMap = new Map(candidateNodes.map((node) => [node.id, node]));
  return nodeIds
    .map((nodeId, index) => {
      const node = candidateMap.get(nodeId);
      if (!node) return null;
      const anchor = resolveGeometryAnchor(node) ?? {
        x:
          typeof node.fabricObject.left === "number"
            ? node.fabricObject.left
            : 0,
        y:
          typeof node.fabricObject.top === "number" ? node.fabricObject.top : 0,
      };
      return {
        nodeId,
        hitPoint: anchor,
        hitOrder: index,
      };
    })
    .filter(
      (
        hit,
      ): hit is {
        nodeId: string;
        hitPoint: CanvasPoint;
        hitOrder: number;
      } => Boolean(hit),
    );
}

export function resolveBusinessCommandPointHit(
  document: DocumentState,
  state: ActiveBusinessCommandState,
  targetNodeId: string,
  point: CanvasPoint,
) {
  const hits = resolveExtractSelectionHits(
    {
      mode: "single",
      point,
      targetNodeId,
    },
    resolveCandidateNodes(document, state),
  );
  return hits[0] ?? null;
}

export function resolveBusinessCommandStrokeHits(
  document: DocumentState,
  state: ActiveBusinessCommandState,
  points: CanvasPoint[],
) {
  return resolveExtractSelectionHits(
    {
      mode: "stroke",
      points,
    },
    resolveCandidateNodes(document, state),
  );
}

export function resolveBusinessCommandBoxSelectionHits(
  document: DocumentState,
  state: ActiveBusinessCommandState,
  nodeIds: readonly string[],
  rect: { left: number; top: number; width: number; height: number },
) {
  const strokeHits = resolveBusinessCommandStrokeHits(document, state, [
    { x: rect.left, y: rect.top },
    { x: rect.left + rect.width, y: rect.top },
    { x: rect.left + rect.width, y: rect.top + rect.height },
    { x: rect.left, y: rect.top + rect.height },
    { x: rect.left, y: rect.top },
  ]);
  const resolved = new Map(strokeHits.map((hit) => [hit.nodeId, hit]));
  const fallbackHits = resolveBusinessCommandSelectionHits(
    document,
    state,
    nodeIds,
  );

  for (const fallbackHit of fallbackHits) {
    if (!resolved.has(fallbackHit.nodeId)) {
      resolved.set(fallbackHit.nodeId, fallbackHit);
    }
  }

  return nodeIds
    .map((nodeId, index) => {
      const hit = resolved.get(nodeId);
      if (!hit) return null;
      return {
        ...hit,
        hitOrder: index,
      };
    })
    .filter(
      (
        hit,
      ): hit is {
        nodeId: string;
        hitPoint: CanvasPoint;
        hitOrder: number;
      } => Boolean(hit),
    );
}

function applyVisualState(
  canvas: Canvas,
  renderDocument: DocumentState,
  lineHighlightMap: ReadonlyMap<string, LineHighlightInfo>,
  pendingBrushHitMap: ReadonlyMap<string, CanvasPoint>,
  pendingBrushHitColor: string,
  previewLabelNodeIds: ReadonlySet<string>,
  hoveredLineId: string | null,
  selectionToolActive: boolean,
) {
  for (const obj of canvas.getObjects()) {
    const nodeId = getNodeIdFromObject(obj);
    if (!nodeId) continue;
    const node = renderDocument.scene.nodes[nodeId];
    const baseStroke =
      node && typeof node.fabricObject.stroke === "string"
        ? node.fabricObject.stroke
        : typeof obj.stroke === "string"
          ? obj.stroke
          : "#111827";
    const baseStrokeWidth =
      node && typeof node.fabricObject.strokeWidth === "number"
        ? node.fabricObject.strokeWidth
        : typeof obj.strokeWidth === "number"
          ? obj.strokeWidth
          : 1;
    const lineInfo = lineHighlightMap.get(nodeId);
    const hasPendingBrushHit = pendingBrushHitMap.has(nodeId);
    const isHovered = hoveredLineId === nodeId && !(lineInfo?.isUsed ?? false);
    const isPreviewLabel = previewLabelNodeIds.has(nodeId);

    if (
      node &&
      (node.fabricObject.type === "line" || node.fabricObject.type === "path")
    ) {
      const strokeColor =
        lineInfo?.color ??
        (hasPendingBrushHit ? pendingBrushHitColor : baseStroke);
      const isUsed = lineInfo?.isUsed ?? false;
      const isSelected = Boolean(lineInfo && !lineInfo.isUsed);
      obj.set({
        stroke: strokeColor,
        opacity: isSelected
          ? 1
          : hasPendingBrushHit
            ? 0.9
            : isHovered
              ? 0.95
              : isUsed
                ? 0.75
                : lineInfo
                  ? 0.35
                  : 1,
        strokeWidth: isHovered
          ? Math.max(baseStrokeWidth * 1.6, 2.5)
          : baseStrokeWidth,
        selectable: false,
        evented: !selectionToolActive,
      });
      obj.setCoords();
      continue;
    }

    if (isPreviewLabel) {
      obj.set({
        selectable: selectionToolActive,
        evented: selectionToolActive,
        hasControls: false,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
        // Allow dragging preview labels only when the selection tool is active.
        // This lets users adjust label positions during business commands, while keeping
        // them non-interactive in brush modes.
        lockMovementX: !selectionToolActive,
        lockMovementY: !selectionToolActive,
        editable: false,
        moveCursor: selectionToolActive ? "move" : "default",
        hoverCursor: selectionToolActive ? "move" : "default",
      });
      obj.setCoords();
      continue;
    }

    obj.set({
      selectable: false,
      evented: false,
    });
    obj.setCoords();
  }
  canvas.renderAll();
}

export function bindFabricBusinessCommandEvents({
  canvas,
  getDocument,
  getRenderDocument,
  getBusinessCommand,
  activeToolId,
  subscribe,
  updateBusinessCommand,
}: BindFabricBusinessCommandEventsOptions) {
  let hoveredLineId: string | null = null;
  let activePointer = false;
  let pressStart: CanvasPoint | null = null;
  let lastPoint: CanvasPoint | null = null;
  let brushMode = false;
  let brushPoints: CanvasPoint[] = [];
  let brushPreview: Polyline | null = null;
  let brushPreviewHits: Array<{
    nodeId: string;
    hitPoint: CanvasPoint;
    hitOrder: number;
  }> = [];
  let brushHitMarkers: Circle[] = [];

  const ensureBrushPreview = () => {
    if (brushPreview) return brushPreview;
    brushPreview = new Polyline([], {
      fill: "",
      stroke: "#2563eb",
      strokeWidth: 2,
      strokeDashArray: [8, 6],
      selectable: false,
      evented: false,
      objectCaching: false,
    } as never);
    canvas.add(brushPreview);
    canvas.bringObjectToFront(brushPreview);
    return brushPreview;
  };

  const clearBrushPreview = () => {
    if (!brushPreview) return;
    canvas.remove(brushPreview);
    brushPreview = null;
  };

  const syncBrushHitMarkers = (
    hits: Array<{ nodeId: string; hitPoint: CanvasPoint; hitOrder: number }>,
    color: string,
  ) => {
    while (brushHitMarkers.length > hits.length) {
      const marker = brushHitMarkers.pop();
      if (marker) canvas.remove(marker);
    }

    hits.forEach((hit, index) => {
      const marker =
        brushHitMarkers[index] ??
        new Circle({
          radius: 4,
          fill: "#ffffff",
          stroke: color,
          strokeWidth: 2,
          selectable: false,
          evented: false,
          objectCaching: false,
          originX: "center",
          originY: "center",
        });
      marker.set({
        left: hit.hitPoint.x,
        top: hit.hitPoint.y,
        stroke: color,
        visible: true,
      });
      if (!brushHitMarkers[index]) {
        brushHitMarkers[index] = marker;
        canvas.add(marker);
      }
      canvas.bringObjectToFront(marker);
    });
  };

  const clearBrushHitMarkers = () => {
    if (brushHitMarkers.length === 0) return;
    for (const marker of brushHitMarkers) {
      canvas.remove(marker);
    }
    brushHitMarkers = [];
  };

  const refresh = () => {
    const businessCommand = getBusinessCommand();
    if (!businessCommand) {
      clearBrushHitMarkers();
      canvas.renderAll();
      return;
    }
    const renderDocument = getRenderDocument();
    const previewLabelNodeIds = new Set([
      ...buildPreviewLabelMap(getDocument(), businessCommand).keys(),
    ]);
    const pendingBrushHitMap = new Map(
      brushPreviewHits.map((hit) => [hit.nodeId, hit.hitPoint]),
    );
    const pendingBrushHitColor = resolvePendingHitColor(businessCommand);
    applyVisualState(
      canvas,
      renderDocument,
      resolveLineHighlightMap(businessCommand),
      pendingBrushHitMap,
      pendingBrushHitColor,
      previewLabelNodeIds,
      hoveredLineId,
      isSelectionToolActive(activeToolId),
    );
    syncBrushHitMarkers(brushPreviewHits, pendingBrushHitColor);
  };

  const resetGestureState = () => {
    activePointer = false;
    pressStart = null;
    lastPoint = null;
    brushMode = false;
    brushPoints = [];
    brushPreviewHits = [];
    clearBrushPreview();
    clearBrushHitMarkers();
  };

  const handleMouseDown = (evt: {
    target?: FabricObject;
    scenePoint?: CanvasPoint;
  }) => {
    const businessCommand = getBusinessCommand();
    if (!businessCommand || !evt.scenePoint) return;
    if (isSelectionToolActive(activeToolId)) return;

    activePointer = true;
    pressStart = evt.scenePoint;
    lastPoint = evt.scenePoint;
    brushMode = false;
    brushPoints = [evt.scenePoint];
  };

  const handleMouseMove = (evt: { scenePoint?: CanvasPoint }) => {
    const businessCommand = getBusinessCommand();
    const point = evt.scenePoint;
    if (!businessCommand || !point) return;
    if (isSelectionToolActive(activeToolId)) return;

    const candidateNodes = resolveCandidateNodes(
      getDocument(),
      businessCommand,
    );
    if (!activePointer) {
      hoveredLineId =
        findNearbyLines(point, candidateNodes, CLICK_HIT_THRESHOLD * 1.5)[0]
          ?.nodeId ?? null;
      refresh();
      return;
    }

    if (!pressStart || !lastPoint) {
      pressStart = point;
      lastPoint = point;
      return;
    }

    const isBrushTool = activeToolId === "select-lasso";
    if (!brushMode) {
      const distance = Math.hypot(
        point.x - pressStart.x,
        point.y - pressStart.y,
      );
      const activateDistance = isBrushTool ? 0 : BRUSH_ACTIVATE_DISTANCE;
      if (distance > activateDistance) {
        brushMode = true;
        const preview = ensureBrushPreview();
        brushPoints = [pressStart, point];
        preview.set({ points: brushPoints });
      }
    }

    if (brushMode) {
      const previousPoint = brushPoints[brushPoints.length - 1];
      if (
        !previousPoint ||
        previousPoint.x !== point.x ||
        previousPoint.y !== point.y
      ) {
        brushPoints = [...brushPoints, point];
      }
      const preview = ensureBrushPreview();
      preview.set({
        points: brushPoints,
      });
      brushPreviewHits =
        brushPoints.length >= 2
          ? resolveExtractSelectionHits(
              {
                mode: "stroke",
                points: brushPoints,
              },
              candidateNodes,
            )
          : [];
      canvas.bringObjectToFront(preview);
      refresh();
    }

    lastPoint = point;
  };

  const handleMouseUp = (evt: { scenePoint?: CanvasPoint }) => {
    const businessCommand = getBusinessCommand();
    const point = evt.scenePoint;
    if (!businessCommand) {
      resetGestureState();
      return;
    }
    if (isSelectionToolActive(activeToolId)) {
      resetGestureState();
      refresh();
      return;
    }

    const isBrushTool = activeToolId === "select-lasso";
    const candidateNodes = resolveCandidateNodes(
      getDocument(),
      businessCommand,
    );

    if (brushMode && brushPoints.length >= 2) {
      const hits =
        brushPreviewHits.length > 0
          ? brushPreviewHits
          : resolveExtractSelectionHits(
              {
                mode: "stroke",
                points: brushPoints,
              },
              candidateNodes,
            );
      if (hits.length > 0) {
        updateBusinessCommand((current) =>
          updateSessionWithHits(current, hits),
        );
      }
    } else if (point && (isBrushTool || !activeToolId)) {
      const hit = findSingleHit(point, candidateNodes);
      if (hit) {
        updateBusinessCommand((current) =>
          updateSessionWithHits(current, [hit]),
        );
      }
    }

    resetGestureState();
    refresh();
  };

  const handleObjectModified = (evt: { target?: FabricObject }) => {
    const businessCommand = getBusinessCommand();
    const target = evt.target;
    if (!businessCommand || !target) return;

    const previewLabelMap = buildPreviewLabelMap(
      getDocument(),
      businessCommand,
    );
    const targets =
      target instanceof ActiveSelection ? target.getObjects() : [target];
    const updates = targets
      .map((obj) => {
        const previewNodeId = getNodeIdFromObject(obj);
        if (!previewNodeId) return null;
        const lineId = previewLabelMap.get(previewNodeId);
        if (!lineId) return null;
        const point = resolveObjectCanvasPoint(obj);
        if (!point) return null;
        return { lineId, point };
      })
      .filter(
        (
          item,
        ): item is {
          lineId: string;
          point: CanvasPoint;
        } => Boolean(item),
      );

    if (updates.length === 0) return;

    updateBusinessCommand((current) => {
      let next = current;
      for (const update of updates) {
        next = updateSessionLabelPosition(next, update.lineId, update.point);
      }
      return next;
    });
  };

  const unsubscribe = subscribe?.(refresh);

  canvas.on("mouse:down", handleMouseDown);
  canvas.on("mouse:move", handleMouseMove);
  canvas.on("mouse:up", handleMouseUp);
  canvas.on("object:modified", handleObjectModified);
  refresh();

  return () => {
    unsubscribe?.();
    resetGestureState();
    hoveredLineId = null;
    canvas.off("mouse:down", handleMouseDown);
    canvas.off("mouse:move", handleMouseMove);
    canvas.off("mouse:up", handleMouseUp);
    canvas.off("object:modified", handleObjectModified);
    refresh();
  };
}
