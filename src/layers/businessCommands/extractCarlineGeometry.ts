import type { EditorNode, NodeId } from "../data/types";
import type {
  CanvasPoint,
  ExtractSelectionInput,
  HitLineResult,
} from "./businessCommandTypes";

export interface Segment {
  start: CanvasPoint;
  end: CanvasPoint;
}

export interface ResolvedLineGeometry {
  nodeId: NodeId;
  sourceType: "line" | "path";
  segments: Segment[];
}

function ensureFiniteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function distanceBetweenPoints(a: CanvasPoint, b: CanvasPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildSegmentsFromPoints(points: CanvasPoint[]) {
  const segments: Segment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (distanceBetweenPoints(start, end) <= 0) continue;
    segments.push({ start, end });
  }
  return segments;
}

function projectPointToSegment(point: CanvasPoint, segment: Segment) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return {
      point: { ...segment.start },
      distance: distanceBetweenPoints(point, segment.start),
      offset: 0,
    };
  }

  const rawT =
    ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) /
    lengthSquared;
  const t = Math.min(1, Math.max(0, rawT));
  const projected = {
    x: segment.start.x + dx * t,
    y: segment.start.y + dy * t,
  };
  return {
    point: projected,
    distance: distanceBetweenPoints(point, projected),
    offset: t,
  };
}

function computeSegmentIntersection(a: Segment, b: Segment) {
  const r = {
    x: a.end.x - a.start.x,
    y: a.end.y - a.start.y,
  };
  const s = {
    x: b.end.x - b.start.x,
    y: b.end.y - b.start.y,
  };
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) < 1e-6) return null;

  const delta = {
    x: b.start.x - a.start.x,
    y: b.start.y - a.start.y,
  };
  const t = (delta.x * s.y - delta.y * s.x) / denominator;
  const u = (delta.x * r.y - delta.y * r.x) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return {
    point: {
      x: a.start.x + t * r.x,
      y: a.start.y + t * r.y,
    },
    offsetOnA: t,
    offsetOnB: u,
  };
}

function normalizePathPoint(
  current: CanvasPoint,
  command: unknown[],
  xIndex: number,
  yIndex: number,
  isRelative: boolean,
) {
  const x = ensureFiniteNumber(command[xIndex], current.x);
  const y = ensureFiniteNumber(command[yIndex], current.y);
  return isRelative
    ? { x: current.x + x, y: current.y + y }
    : { x, y };
}

function resolvePathSegments(node: EditorNode) {
  const rawPath = node.fabricObject.path;
  if (!Array.isArray(rawPath)) return [];

  const segments: Segment[] = [];
  let current: CanvasPoint = {
    x: ensureFiniteNumber(node.fabricObject.left, 0),
    y: ensureFiniteNumber(node.fabricObject.top, 0),
  };
  let subpathStart: CanvasPoint | null = null;

  for (const rawCommand of rawPath) {
    if (!Array.isArray(rawCommand) || typeof rawCommand[0] !== "string") continue;
    const commandType = rawCommand[0];
    const isRelative = commandType === commandType.toLowerCase();
    const normalizedType = commandType.toUpperCase();

    if (normalizedType === "M") {
      current = normalizePathPoint(current, rawCommand, 1, 2, isRelative);
      subpathStart = { ...current };
      continue;
    }

    if (normalizedType === "L") {
      const nextPoint = normalizePathPoint(current, rawCommand, 1, 2, isRelative);
      segments.push({ start: { ...current }, end: nextPoint });
      current = nextPoint;
      continue;
    }

    if (normalizedType === "H") {
      const rawX = ensureFiniteNumber(rawCommand[1], current.x);
      const nextPoint = {
        x: isRelative ? current.x + rawX : rawX,
        y: current.y,
      };
      segments.push({ start: { ...current }, end: nextPoint });
      current = nextPoint;
      continue;
    }

    if (normalizedType === "V") {
      const rawY = ensureFiniteNumber(rawCommand[1], current.y);
      const nextPoint = {
        x: current.x,
        y: isRelative ? current.y + rawY : rawY,
      };
      segments.push({ start: { ...current }, end: nextPoint });
      current = nextPoint;
      continue;
    }

    if (normalizedType === "Z" && subpathStart) {
      segments.push({ start: { ...current }, end: { ...subpathStart } });
      current = { ...subpathStart };
    }
  }

  return segments;
}

export function isExtractableLineFabricType(fabricType: string) {
  return fabricType === "line" || fabricType === "path";
}

export function resolveExtractableLineGeometry(
  node: EditorNode,
): ResolvedLineGeometry | null {
  if (!isExtractableLineFabricType(node.fabricObject.type)) return null;

  if (node.fabricObject.type === "line") {
    const x1 = ensureFiniteNumber(node.fabricObject.x1, 0);
    const y1 = ensureFiniteNumber(node.fabricObject.y1, 0);
    const x2 = ensureFiniteNumber(node.fabricObject.x2, 0);
    const y2 = ensureFiniteNumber(node.fabricObject.y2, 0);
    return {
      nodeId: node.id,
      sourceType: "line",
      segments: [
        {
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
        },
      ],
    };
  }

  return {
    nodeId: node.id,
    sourceType: "path",
    segments: resolvePathSegments(node),
  };
}

export function buildStrokeSegments(points: CanvasPoint[]) {
  return buildSegmentsFromPoints(points);
}

export function findNearestPointOnGeometry(
  point: CanvasPoint,
  geometry: ResolvedLineGeometry,
) {
  let nearest:
    | {
        point: CanvasPoint;
        distance: number;
      }
    | null = null;

  for (const segment of geometry.segments) {
    const projected = projectPointToSegment(point, segment);
    if (!nearest || projected.distance < nearest.distance) {
      nearest = {
        point: projected.point,
        distance: projected.distance,
      };
    }
  }

  return nearest;
}

export function findFirstStrokeIntersection(
  strokePoints: CanvasPoint[],
  geometry: ResolvedLineGeometry,
) {
  const strokeSegments = buildStrokeSegments(strokePoints);
  let best:
    | {
        point: CanvasPoint;
        strokeDistance: number;
      }
    | null = null;
  let traversedStrokeLength = 0;

  for (const strokeSegment of strokeSegments) {
    const segmentLength = distanceBetweenPoints(
      strokeSegment.start,
      strokeSegment.end,
    );

    for (const geometrySegment of geometry.segments) {
      const intersection = computeSegmentIntersection(
        strokeSegment,
        geometrySegment,
      );
      if (!intersection) continue;

      const strokeDistance =
        traversedStrokeLength + segmentLength * intersection.offsetOnA;
      if (!best || strokeDistance < best.strokeDistance) {
        best = {
          point: intersection.point,
          strokeDistance,
        };
      }
    }

    traversedStrokeLength += segmentLength;
  }

  return best;
}

export function resolveExtractSelectionHits(
  input: ExtractSelectionInput,
  nodes: EditorNode[],
) {
  if (input.mode === "single") {
    const node = nodes.find((item) => item.id === input.targetNodeId);
    if (!node) return [] as HitLineResult[];
    const geometry = resolveExtractableLineGeometry(node);
    if (!geometry) return [] as HitLineResult[];
    const nearest = findNearestPointOnGeometry(input.point, geometry);
    if (!nearest) return [] as HitLineResult[];
    return [
      {
        nodeId: node.id,
        hitPoint: nearest.point,
        hitOrder: 0,
      },
    ];
  }

  const hits: HitLineResult[] = [];
  for (const node of nodes) {
    const geometry = resolveExtractableLineGeometry(node);
    if (!geometry) continue;
    const intersection = findFirstStrokeIntersection(input.points, geometry);
    if (!intersection) continue;
    hits.push({
      nodeId: node.id,
      hitPoint: intersection.point,
      hitOrder: intersection.strokeDistance,
    });
  }

  return hits.sort((a, b) => a.hitOrder - b.hitOrder);
}
