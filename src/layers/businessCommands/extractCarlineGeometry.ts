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
  return isRelative ? { x: current.x + x, y: current.y + y } : { x, y };
}

// 三次贝塞尔折线化
function tessellateCubicBezier(
  p0: CanvasPoint,
  cp1: CanvasPoint,
  cp2: CanvasPoint,
  p3: CanvasPoint,
  steps: number,
): Segment[] {
  const segments: Segment[] = [];
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0.x +
      3 * mt * mt * t * cp1.x +
      3 * mt * t * t * cp2.x +
      t * t * t * p3.x;
    const y =
      mt * mt * mt * p0.y +
      3 * mt * mt * t * cp1.y +
      3 * mt * t * t * cp2.y +
      t * t * t * p3.y;
    const next = { x, y };
    if (distanceBetweenPoints(prev, next) > 0) {
      segments.push({ start: { ...prev }, end: next });
    }
    prev = next;
  }
  return segments;
}

// 二次贝塞尔折线化
function tessellateQuadraticBezier(
  p0: CanvasPoint,
  cp: CanvasPoint,
  p2: CanvasPoint,
  steps: number,
): Segment[] {
  const segments: Segment[] = [];
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p2.x;
    const y = mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p2.y;
    const next = { x, y };
    if (distanceBetweenPoints(prev, next) > 0) {
      segments.push({ start: { ...prev }, end: next });
    }
    prev = next;
  }
  return segments;
}

/**
 * Fabric path 对象的坐标约定：
 * - path 数组中的坐标是以 path 自身包围盒中心为原点的相对坐标
 * - node.fabricObject.left/top 是包围盒左上角在画布上的位置
 * - scaleX/scaleY 是额外的缩放变换
 *
 * 因此解析时：current 从 (0,0) 开始（相对于包围盒中心），
 * 所有点解析完之后，通过 applyFabricPathTransform 转换到画布坐标。
 */
function applyFabricPathTransform(
  point: CanvasPoint,
  node: EditorNode,
  pathBounds: { minX: number; minY: number; width: number; height: number },
): CanvasPoint {
  const left = ensureFiniteNumber(node.fabricObject.left, 0);
  const top = ensureFiniteNumber(node.fabricObject.top, 0);
  const scaleX = ensureFiniteNumber(node.fabricObject.scaleX, 1) || 1;
  const scaleY = ensureFiniteNumber(node.fabricObject.scaleY, 1) || 1;
  // Fabric path 坐标原点在包围盒中心，left/top 是包围盒左上角
  // 所以画布坐标 = left + (pathX - pathBounds.minX) * scaleX
  //              = top  + (pathY - pathBounds.minY) * scaleY
  return {
    x: left + (point.x - pathBounds.minX) * scaleX,
    y: top + (point.y - pathBounds.minY) * scaleY,
  };
}

function computeRawPathBounds(rawPath: unknown[]): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  // 快速扫描一遍 path 数组，收集所有坐标点的范围
  // 只看 M/L/H/V/C/Q/A/S/T 终点，足够用于计算包围盒
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let cx = 0;
  let cy = 0;

  function record(x: number, y: number) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  for (const rawCommand of rawPath) {
    if (!Array.isArray(rawCommand) || typeof rawCommand[0] !== "string")
      continue;
    const cmd = rawCommand[0] as string;
    const rel = cmd === cmd.toLowerCase();
    const t = cmd.toUpperCase();
    if (t === "M" || t === "L") {
      const x = ensureFiniteNumber(rawCommand[1], cx);
      const y = ensureFiniteNumber(rawCommand[2], cy);
      cx = rel ? cx + x : x;
      cy = rel ? cy + y : y;
      record(cx, cy);
    } else if (t === "H") {
      const x = ensureFiniteNumber(rawCommand[1], cx);
      cx = rel ? cx + x : x;
      record(cx, cy);
    } else if (t === "V") {
      const y = ensureFiniteNumber(rawCommand[1], cy);
      cy = rel ? cy + y : y;
      record(cx, cy);
    } else if (t === "C") {
      const x = ensureFiniteNumber(rawCommand[5], cx);
      const y = ensureFiniteNumber(rawCommand[6], cy);
      cx = rel ? cx + x : x;
      cy = rel ? cy + y : y;
      record(cx, cy);
    } else if (t === "Q" || t === "S") {
      const x = ensureFiniteNumber(rawCommand[3], cx);
      const y = ensureFiniteNumber(rawCommand[4], cy);
      cx = rel ? cx + x : x;
      cy = rel ? cy + y : y;
      record(cx, cy);
    } else if (t === "A") {
      const x = ensureFiniteNumber(rawCommand[6], cx);
      const y = ensureFiniteNumber(rawCommand[7], cy);
      cx = rel ? cx + x : x;
      cy = rel ? cy + y : y;
      record(cx, cy);
    } else if (t === "T") {
      const x = ensureFiniteNumber(rawCommand[1], cx);
      const y = ensureFiniteNumber(rawCommand[2], cy);
      cx = rel ? cx + x : x;
      cy = rel ? cy + y : y;
      record(cx, cy);
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, width: 0, height: 0 };
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function resolvePathSegments(node: EditorNode) {
  const rawPath = node.fabricObject.path;
  if (!Array.isArray(rawPath)) return [];

  // Fabric path 命令坐标是以路径自身坐标系（包围盒左上角为原点）表达的
  // current 从 (0,0) 开始，解析完后再统一做画布变换
  const pathBounds = computeRawPathBounds(rawPath);

  const rawSegments: Segment[] = [];
  let current: CanvasPoint = { x: 0, y: 0 };
  // 记录 M 之后的绝对初始位置，供 Z 命令闭合使用
  let subpathStart: CanvasPoint | null = null;

  for (const rawCommand of rawPath) {
    if (!Array.isArray(rawCommand) || typeof rawCommand[0] !== "string")
      continue;
    const commandType = rawCommand[0];
    const isRelative = commandType === commandType.toLowerCase();
    const normalizedType = commandType.toUpperCase();

    if (normalizedType === "M") {
      current = normalizePathPoint(current, rawCommand, 1, 2, isRelative);
      subpathStart = { ...current };
      continue;
    }

    if (normalizedType === "L") {
      const nextPoint = normalizePathPoint(
        current,
        rawCommand,
        1,
        2,
        isRelative,
      );
      rawSegments.push({ start: { ...current }, end: nextPoint });
      current = nextPoint;
      continue;
    }

    if (normalizedType === "H") {
      const rawX = ensureFiniteNumber(rawCommand[1], current.x);
      const nextPoint = {
        x: isRelative ? current.x + rawX : rawX,
        y: current.y,
      };
      rawSegments.push({ start: { ...current }, end: nextPoint });
      current = nextPoint;
      continue;
    }

    if (normalizedType === "V") {
      const rawY = ensureFiniteNumber(rawCommand[1], current.y);
      const nextPoint = {
        x: current.x,
        y: isRelative ? current.y + rawY : rawY,
      };
      rawSegments.push({ start: { ...current }, end: nextPoint });
      current = nextPoint;
      continue;
    }

    if (normalizedType === "Z" && subpathStart) {
      rawSegments.push({ start: { ...current }, end: { ...subpathStart } });
      current = { ...subpathStart };
      continue;
    }

    if (normalizedType === "C") {
      const cp1x = ensureFiniteNumber(rawCommand[1], current.x);
      const cp1y = ensureFiniteNumber(rawCommand[2], current.y);
      const cp2x = ensureFiniteNumber(rawCommand[3], current.x);
      const cp2y = ensureFiniteNumber(rawCommand[4], current.y);
      const rawX = ensureFiniteNumber(rawCommand[5], current.x);
      const rawY = ensureFiniteNumber(rawCommand[6], current.y);
      const cp1: CanvasPoint = isRelative
        ? { x: current.x + cp1x, y: current.y + cp1y }
        : { x: cp1x, y: cp1y };
      const cp2: CanvasPoint = isRelative
        ? { x: current.x + cp2x, y: current.y + cp2y }
        : { x: cp2x, y: cp2y };
      const endPoint: CanvasPoint = isRelative
        ? { x: current.x + rawX, y: current.y + rawY }
        : { x: rawX, y: rawY };
      rawSegments.push(
        ...tessellateCubicBezier(current, cp1, cp2, endPoint, 16),
      );
      current = endPoint;
      continue;
    }

    if (normalizedType === "Q") {
      const cpx = ensureFiniteNumber(rawCommand[1], current.x);
      const cpy = ensureFiniteNumber(rawCommand[2], current.y);
      const rawX = ensureFiniteNumber(rawCommand[3], current.x);
      const rawY = ensureFiniteNumber(rawCommand[4], current.y);
      const cp: CanvasPoint = isRelative
        ? { x: current.x + cpx, y: current.y + cpy }
        : { x: cpx, y: cpy };
      const endPoint: CanvasPoint = isRelative
        ? { x: current.x + rawX, y: current.y + rawY }
        : { x: rawX, y: rawY };
      rawSegments.push(...tessellateQuadraticBezier(current, cp, endPoint, 10));
      current = endPoint;
      continue;
    }

    if (normalizedType === "A") {
      const rawX = ensureFiniteNumber(rawCommand[6], current.x);
      const rawY = ensureFiniteNumber(rawCommand[7], current.y);
      const endPoint: CanvasPoint = isRelative
        ? { x: current.x + rawX, y: current.y + rawY }
        : { x: rawX, y: rawY };
      if (distanceBetweenPoints(current, endPoint) > 0) {
        rawSegments.push({ start: { ...current }, end: endPoint });
      }
      current = endPoint;
      continue;
    }

    if (normalizedType === "S") {
      const cp2x = ensureFiniteNumber(rawCommand[1], current.x);
      const cp2y = ensureFiniteNumber(rawCommand[2], current.y);
      const rawX = ensureFiniteNumber(rawCommand[3], current.x);
      const rawY = ensureFiniteNumber(rawCommand[4], current.y);
      const cp1: CanvasPoint = { ...current };
      const cp2: CanvasPoint = isRelative
        ? { x: current.x + cp2x, y: current.y + cp2y }
        : { x: cp2x, y: cp2y };
      const endPoint: CanvasPoint = isRelative
        ? { x: current.x + rawX, y: current.y + rawY }
        : { x: rawX, y: rawY };
      rawSegments.push(
        ...tessellateCubicBezier(current, cp1, cp2, endPoint, 16),
      );
      current = endPoint;
      continue;
    }

    if (normalizedType === "T") {
      const rawX = ensureFiniteNumber(rawCommand[1], current.x);
      const rawY = ensureFiniteNumber(rawCommand[2], current.y);
      const cp: CanvasPoint = { ...current };
      const endPoint: CanvasPoint = isRelative
        ? { x: current.x + rawX, y: current.y + rawY }
        : { x: rawX, y: rawY };
      rawSegments.push(...tessellateQuadraticBezier(current, cp, endPoint, 10));
      current = endPoint;
      continue;
    }
  }

  // 将路径坐标系下的所有线段统一变换到画布坐标系
  return rawSegments.map((seg) => ({
    start: applyFabricPathTransform(seg.start, node, pathBounds),
    end: applyFabricPathTransform(seg.end, node, pathBounds),
  }));
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
  let nearest: {
    point: CanvasPoint;
    distance: number;
  } | null = null;

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
  let best: {
    point: CanvasPoint;
    strokeDistance: number;
  } | null = null;
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

/**
 * 在 SVG 坐标系中，检测给定点是否"足够靠近"任意一条线几何体。
 * 用于单击模式的几何命中检测，替代基于 DOM elementsFromPoint 的像素拾取。
 *
 * @param svgPoint 点击位置（SVG 坐标系）
 * @param nodes 所有候选节点
 * @param threshold 距离阈值（SVG 坐标单位），默认 8
 * @returns 命中结果数组，按距离从近到远排序
 */
export function findNearbyLines(
  svgPoint: CanvasPoint,
  nodes: EditorNode[],
  threshold = 8,
): HitLineResult[] {
  const hits: HitLineResult[] = [];
  for (const node of nodes) {
    const geometry = resolveExtractableLineGeometry(node);
    if (!geometry || geometry.segments.length === 0) continue;
    const nearest = findNearestPointOnGeometry(svgPoint, geometry);
    if (!nearest || nearest.distance > threshold) continue;
    hits.push({
      nodeId: node.id,
      hitPoint: nearest.point,
      hitOrder: nearest.distance,
    });
  }
  return hits.sort((a, b) => a.hitOrder - b.hitOrder);
}
