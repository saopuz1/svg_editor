import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentState } from '../../data/types';
import type {
  ExtractCarlineCompletedArea,
  ExtractCarlineSession,
} from '../businessCommandTypes';

const LINE_SELECTOR = '[data-business-command-line="true"]';
const BRUSH_HOLD_MS = 180;
const BRUSH_MOVE_TOLERANCE = 4;

const AREA_COLORS = [
  '#2563eb',
  '#0f766e',
  '#b45309',
  '#7c3aed',
  '#db2777',
  '#059669',
  '#d97706',
  '#6366f1',
  '#be185d',
  '#16a34a',
];

function getAreaColor(areaIndex: number): string {
  return AREA_COLORS[areaIndex % AREA_COLORS.length];
}

type SvgPoint = {
  x: number;
  y: number;
};

function annotateSvgMarkup(svgMarkup: string, document: DocumentState) {
  if (!svgMarkup.trim()) return '';

  const parser = new DOMParser();
  const parsed = parser.parseFromString(svgMarkup, 'image/svg+xml');
  const svg = parsed.querySelector('svg');
  if (!svg) return svgMarkup;

  svg.setAttribute('class', 'businessCommandSvgRoot');
  svg.setAttribute('width', String(document.canvas.width));
  svg.setAttribute('height', String(document.canvas.height));
  svg.setAttribute('viewBox', `0 0 ${document.canvas.width} ${document.canvas.height}`);

  const exportedElements = Array.from(svg.querySelectorAll('line, path'));
  
  let elementIndex = 0;
  for (const id of document.scene.order) {
    const node = document.scene.nodes[id];
    if (!node || (node.fabricObject.type !== 'line' && node.fabricObject.type !== 'path')) {
      continue;
    }
    
    const element = exportedElements[elementIndex];
    if (!element) break;
    
    const stroke = element.getAttribute('stroke') ?? '';
    const strokeWidth = element.getAttribute('stroke-width') ?? '';
    element.setAttribute('data-business-command-line', 'true');
    element.setAttribute('data-node-id', node.id);
    element.setAttribute('data-original-stroke', stroke);
    element.setAttribute('data-original-stroke-width', strokeWidth);
    const nextClassName = `${element.getAttribute('class') ?? ''} businessCommandLine`;
    element.setAttribute('class', nextClassName.trim());
    
    elementIndex++;
  }

  return new XMLSerializer().serializeToString(svg);
}

function clientToSvgPoint(
  svgRoot: SVGSVGElement,
  clientX: number,
  clientY: number,
): SvgPoint | null {
  const point = svgRoot.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svgRoot.getScreenCTM();
  if (!ctm) return null;
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

function getLineIdFromPoint(
  root: HTMLDivElement,
  clientX: number,
  clientY: number,
  allowedNodeIds: Set<string>,
) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const rawElement of elements) {
    if (!(rawElement instanceof Element)) continue;
    const matched = rawElement.closest(LINE_SELECTOR);
    if (!matched || !root.contains(matched)) continue;
    const nodeId = matched.getAttribute('data-node-id') ?? '';
    if (nodeId && allowedNodeIds.has(nodeId)) {
      return nodeId;
    }
  }
  return '';
}

function samplePoints(prev: SvgPoint, cur: SvgPoint) {
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distance));
  const points: SvgPoint[] = [];
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    points.push({
      x: prev.x + dx * t,
      y: prev.y + dy * t,
    });
  }
  return points;
}

function buildLabelItems(area: ExtractCarlineCompletedArea | ExtractCarlineSession['currentDraft']) {
  return area.selectedLines.map((line, index) => ({
    key: `${area.areaName}-${line.nodeId}`,
    text: String(index + 1),
    x: line.hitPoint.x,
    y: line.hitPoint.y,
  }));
}

export function BusinessCommandSvgSurface({
  document,
  svgMarkup,
  session,
  onToggleLine,
}: {
  document: DocumentState;
  svgMarkup: string;
  session: ExtractCarlineSession;
  onToggleLine: (nodeId: string, markerPos: SvgPoint) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const visitedRef = useRef<Set<string>>(new Set());
  const lastPointRef = useRef<SvgPoint | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const pressStartPointRef = useRef<SvgPoint | null>(null);
  const brushModeRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const brushClientPathRef = useRef<SvgPoint[]>([]);
  const brushSvgPathRef = useRef<SvgPoint[]>([]);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [brushPath, setBrushPath] = useState<SvgPoint[]>([]);

  const annotatedMarkup = useMemo(
    () => annotateSvgMarkup(svgMarkup, document),
    [document, svgMarkup],
  );
  const allLineIds = useMemo(
    () =>
      new Set(
        document.scene.order.filter((id) => {
          const node = document.scene.nodes[id];
          return node?.fabricObject.type === 'line' || node?.fabricObject.type === 'path';
        }),
      ),
    [document],
  );
  const lineAreaMap = useMemo(() => {
    const map = new Map<string, { color: string; areaName: string; isUsed: boolean }>();
    session.completedAreas.forEach((area, index) => {
      const color = getAreaColor(index);
      area.selectedLines.forEach((line) => {
        map.set(line.nodeId, { color, areaName: area.areaName, isUsed: true });
      });
    });
    const currentColor = getAreaColor(session.completedAreas.length);
    session.currentDraft.selectedLines.forEach((line) => {
      map.set(line.nodeId, { color: currentColor, areaName: session.currentDraft.areaName, isUsed: false });
    });
    return map;
  }, [session.completedAreas, session.currentDraft]);
  const previewLabels = useMemo(() => {
    const completed = session.completedAreas.flatMap((area, index) => {
      const color = getAreaColor(index);
      return buildLabelItems(area).map((item) => ({ ...item, color }));
    });
    const currentColor = getAreaColor(session.completedAreas.length);
    const current = buildLabelItems(session.currentDraft).map((item) => ({ ...item, color: currentColor }));
    return [...completed, ...current];
  }, [session.completedAreas, session.currentDraft]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const elements = Array.from(root.querySelectorAll<SVGElement>(LINE_SELECTOR));
    elements.forEach((element) => {
      const nodeId = element.getAttribute('data-node-id') ?? '';
      const originalStroke = element.getAttribute('data-original-stroke') || '#111827';
      const originalWidth = element.getAttribute('data-original-stroke-width') || '1';
      const lineInfo = lineAreaMap.get(nodeId);
      const isUsed = lineInfo?.isUsed ?? false;
      const isCurrentSelected = lineInfo && !lineInfo.isUsed;
      const isHovered = hoveredLineId === nodeId && !isUsed;
      const strokeColor = lineInfo?.color || originalStroke;
      element.setAttribute('stroke', strokeColor);
      element.setAttribute(
        'stroke-width',
        isCurrentSelected || isHovered
          ? String(Math.max(Number(originalWidth) || 1, isCurrentSelected ? 2.8 : 2))
          : isUsed
          ? String(Math.max(Number(originalWidth) || 1, 2.2))
          : originalWidth,
      );
      element.setAttribute('opacity', isCurrentSelected || isHovered ? '1' : isUsed ? '0.7' : '0.86');
      element.classList.toggle('businessCommandLineCurrent', isCurrentSelected);
      element.classList.toggle('businessCommandLineUsed', isUsed);
      element.classList.toggle('businessCommandLineHover', isHovered);
    });
  }, [annotatedMarkup, lineAreaMap, hoveredLineId]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current != null) {
        window.clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const processClientPoint = (clientPoint: SvgPoint) => {
    const root = rootRef.current;
    if (!root) return;
    const svgRoot = root.querySelector<SVGSVGElement>('svg');
    if (!svgRoot) return;
    const nodeId = getLineIdFromPoint(root, clientPoint.x, clientPoint.y, allLineIds);
    if (!nodeId || visitedRef.current.has(nodeId)) return;
    const markerPos = clientToSvgPoint(svgRoot, clientPoint.x, clientPoint.y);
    if (!markerPos) return;
    visitedRef.current.add(nodeId);
    onToggleLine(nodeId, markerPos);
  };

  const appendBrushSvgPoints = (clientPoints: SvgPoint[]) => {
    const root = rootRef.current;
    if (!root || clientPoints.length === 0) return;
    const svgRoot = root.querySelector<SVGSVGElement>('svg');
    if (!svgRoot) return;
    const svgPoints = clientPoints
      .map((point) => clientToSvgPoint(svgRoot, point.x, point.y))
      .filter((point): point is SvgPoint => Boolean(point));
    if (svgPoints.length === 0) return;
    brushSvgPathRef.current = [...brushSvgPathRef.current, ...svgPoints];
    setBrushPath([...brushSvgPathRef.current]);
  };

  const resolveHoveredLine = (clientPoint: SvgPoint) => {
    const root = rootRef.current;
    if (!root) return null;
    const nodeId = getLineIdFromPoint(root, clientPoint.x, clientPoint.y, allLineIds);
    return nodeId || null;
  };

  const clearGestureState = () => {
    activePointerIdRef.current = null;
    visitedRef.current = new Set();
    lastPointRef.current = null;
    pressStartPointRef.current = null;
    brushModeRef.current = false;
    brushClientPathRef.current = [];
    brushSvgPathRef.current = [];
    setBrushPath([]);
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  if (!annotatedMarkup.trim()) return null;

  return (
    <div
      ref={rootRef}
      className="businessCommandSurface"
      onPointerDown={(event) => {
        event.preventDefault();
        activePointerIdRef.current = event.pointerId;
        visitedRef.current = new Set();
        const startPoint = { x: event.clientX, y: event.clientY };
        lastPointRef.current = startPoint;
        pressStartPointRef.current = startPoint;
        brushModeRef.current = false;
        brushClientPathRef.current = [startPoint];
        brushSvgPathRef.current = [];
        setBrushPath([]);
        event.currentTarget.setPointerCapture(event.pointerId);
        setHoveredLineId(resolveHoveredLine(startPoint));
        if (holdTimerRef.current != null) {
          window.clearTimeout(holdTimerRef.current);
        }
        holdTimerRef.current = window.setTimeout(() => {
          brushModeRef.current = true;
          appendBrushSvgPoints(brushClientPathRef.current);
          processClientPoint(startPoint);
        }, BRUSH_HOLD_MS);
      }}
      onPointerMove={(event) => {
        event.preventDefault();
        const current = { x: event.clientX, y: event.clientY };
        if (activePointerIdRef.current !== event.pointerId) {
          setHoveredLineId(resolveHoveredLine(current));
          return;
        }
        const previous = lastPointRef.current;
        if (!previous) {
          lastPointRef.current = current;
          setHoveredLineId(resolveHoveredLine(current));
          return;
        }
        const pressStart = pressStartPointRef.current ?? previous;
        const travelDistance = Math.hypot(current.x - pressStart.x, current.y - pressStart.y);
        if (!brushModeRef.current && travelDistance > BRUSH_MOVE_TOLERANCE) {
          setHoveredLineId(resolveHoveredLine(current));
        }
        if (!brushModeRef.current) {
          lastPointRef.current = current;
          return;
        }
        const samples = samplePoints(previous, current);
        brushClientPathRef.current = [...brushClientPathRef.current, ...samples];
        appendBrushSvgPoints(samples);
        samples.forEach(processClientPoint);
        lastPointRef.current = current;
        setHoveredLineId(resolveHoveredLine(current));
      }}
      onPointerUp={(event) => {
        if (activePointerIdRef.current === event.pointerId) {
          event.preventDefault();
          const point = { x: event.clientX, y: event.clientY };
          const wasBrushMode = brushModeRef.current;
          if (holdTimerRef.current != null) {
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
          }
          if (!wasBrushMode) {
            processClientPoint(point);
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          clearGestureState();
          setHoveredLineId(resolveHoveredLine(point));
        }
      }}
      onPointerCancel={() => {
        clearGestureState();
      }}
      onPointerLeave={() => {
        if (activePointerIdRef.current == null) {
          setHoveredLineId(null);
        }
      }}
    >
      <div
        className="businessCommandSurfaceSvg"
        dangerouslySetInnerHTML={{ __html: annotatedMarkup }}
      />
      <svg
        className="businessCommandSurfaceOverlay"
        viewBox={`0 0 ${document.canvas.width} ${document.canvas.height}`}
      >
        {brushPath.length > 1 ? (
          <polyline
            className="businessCommandBrushPath"
            points={brushPath.map((point) => `${point.x},${point.y}`).join(' ')}
          />
        ) : null}
        {previewLabels.map((label) => (
          <text
            key={label.key}
            className="businessCommandMarkerText"
            x={label.x}
            y={label.y}
            fill={label.color || '#2563eb'}
          >
              {label.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
