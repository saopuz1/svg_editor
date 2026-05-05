import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentState, EditorNode } from "../../data/types";
import {
  findNearbyLines,
  findFirstStrokeIntersection,
  resolveExtractableLineGeometry,
} from "../extractCarlineGeometry";

// ─── 常量 ────────────────────────────────────────────────────────────────────

/**
 * 单击命中阈值（SVG 坐标单位）。
 * 点击落在线条几何体 12 个 SVG 单位以内即视为命中，解决细线难点问题。
 */
const CLICK_HIT_THRESHOLD_SVG = 12;

/**
 * 笔刷模式激活所需的最小移动距离（client px）。
 * 超过此距离立即切换为笔刷模式，无需等待延迟。
 */
const BRUSH_ACTIVATE_DISTANCE = 6;

// ─── 类型 ────────────────────────────────────────────────────────────────────

export type SvgPoint = { x: number; y: number };

export type LineHighlightInfo = {
  color: string;
  /** true = 已锁定（已完成档/区域），不可再选；false = 当前已选 */
  isUsed: boolean;
};

export type SurfaceLabelItem = {
  key: string;
  text: string;
  x: number;
  y: number;
  color: string;
};

// ─── SVG 标注工具 ─────────────────────────────────────────────────────────────

function annotateSvgMarkup(svgMarkup: string, document: DocumentState) {
  if (!svgMarkup.trim()) return "";

  const parser = new DOMParser();
  const parsed = parser.parseFromString(svgMarkup, "image/svg+xml");
  const svg = parsed.querySelector("svg");
  if (!svg) return svgMarkup;

  svg.setAttribute("class", "businessCommandSvgRoot");
  svg.setAttribute("width", String(document.canvas.width));
  svg.setAttribute("height", String(document.canvas.height));
  svg.setAttribute(
    "viewBox",
    `0 0 ${document.canvas.width} ${document.canvas.height}`,
  );

  const exportedElements = Array.from(svg.querySelectorAll("line, path"));

  let elementIndex = 0;
  for (const id of document.scene.order) {
    const node = document.scene.nodes[id];
    if (
      !node ||
      (node.fabricObject.type !== "line" && node.fabricObject.type !== "path")
    ) {
      continue;
    }

    const element = exportedElements[elementIndex];
    if (!element) break;

    const stroke = element.getAttribute("stroke") ?? "";
    const strokeWidth = element.getAttribute("stroke-width") ?? "";
    element.setAttribute("data-business-command-line", "true");
    element.setAttribute("data-node-id", node.id);
    element.setAttribute("data-original-stroke", stroke);
    element.setAttribute("data-original-stroke-width", strokeWidth);
    const nextClassName = `${element.getAttribute("class") ?? ""} businessCommandLine`;
    element.setAttribute("class", nextClassName.trim());

    elementIndex++;
  }

  return new XMLSerializer().serializeToString(svg);
}

// ─── 坐标转换 ─────────────────────────────────────────────────────────────────

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

// ─── 几何命中（单击） ─────────────────────────────────────────────────────────

/**
 * 单击命中：将 client 坐标转换为 SVG 坐标后，
 * 用几何近邻算法在所有候选线段中寻找最近的线。
 * 比 elementsFromPoint 宽容得多，能命中 1px 细线。
 */
function hitTestSingleClick(
  svgRoot: SVGSVGElement,
  clientX: number,
  clientY: number,
  candidateNodes: EditorNode[],
  visitedIds: Set<string>,
): { nodeId: string; hitPoint: SvgPoint } | null {
  const svgPoint = clientToSvgPoint(svgRoot, clientX, clientY);
  if (!svgPoint) return null;

  const hits = findNearbyLines(
    svgPoint,
    candidateNodes,
    CLICK_HIT_THRESHOLD_SVG,
  );
  for (const hit of hits) {
    if (!visitedIds.has(hit.nodeId)) {
      return { nodeId: hit.nodeId, hitPoint: hit.hitPoint };
    }
  }
  return null;
}

// ─── 几何命中（笔刷） ─────────────────────────────────────────────────────────

/**
 * 笔刷命中：用 SVG 坐标系中的笔刷路径（折线）与每条线的线段列表做几何求交。
 * 返回本次新增路径段与哪些线相交（排除已访问）。
 */
function hitTestBrushSegment(
  prevSvgPoint: SvgPoint,
  curSvgPoint: SvgPoint,
  candidateNodes: EditorNode[],
  visitedIds: Set<string>,
): Array<{ nodeId: string; hitPoint: SvgPoint }> {
  const strokePoints = [prevSvgPoint, curSvgPoint];
  const results: Array<{ nodeId: string; hitPoint: SvgPoint }> = [];

  for (const node of candidateNodes) {
    if (visitedIds.has(node.id)) continue;
    const geometry = resolveExtractableLineGeometry(node);
    if (!geometry || geometry.segments.length === 0) continue;
    const intersection = findFirstStrokeIntersection(strokePoints, geometry);
    if (!intersection) continue;
    results.push({ nodeId: node.id, hitPoint: intersection.point });
  }

  return results;
}

// ─── 悬停命中（DOM 辅助，只用于视觉高亮） ────────────────────────────────────

/**
 * 悬停高亮仍用 SVG 几何近邻（不依赖 DOM elementsFromPoint），
 * 阈值稍大，用于视觉提示。
 */
function resolveHoveredLineId(
  svgRoot: SVGSVGElement,
  clientX: number,
  clientY: number,
  candidateNodes: EditorNode[],
): string | null {
  const svgPoint = clientToSvgPoint(svgRoot, clientX, clientY);
  if (!svgPoint) return null;
  const hits = findNearbyLines(
    svgPoint,
    candidateNodes,
    CLICK_HIT_THRESHOLD_SVG * 1.5,
  );
  return hits[0]?.nodeId ?? null;
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function BusinessCommandSvgSurface({
  document,
  svgMarkup,
  candidateNodeIds,
  lineHighlightMap,
  previewLabels,
  onToggleLine,
}: {
  document: DocumentState;
  svgMarkup: string;
  /** 只有这些节点才会被命中（过滤用） */
  candidateNodeIds: ReadonlySet<string>;
  /** 节点高亮信息：key = nodeId，value = 颜色与锁定状态 */
  lineHighlightMap: ReadonlyMap<string, LineHighlightInfo>;
  /** 叠加在 SVG 上方的数字标签列表 */
  previewLabels: SurfaceLabelItem[];
  onToggleLine: (nodeId: string, markerPos: SvgPoint) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 已命中节点 ID 集合（当前笔刷手势内去重）
  const visitedRef = useRef<Set<string>>(new Set());
  // 当前激活的 pointer ID
  const activePointerIdRef = useRef<number | null>(null);
  // 按下时的起点（client）
  const pressStartRef = useRef<SvgPoint | null>(null);
  // 上一次 move 时的 client 点（用于逐段求交）
  const lastClientPointRef = useRef<SvgPoint | null>(null);
  // 上一次 move 时的 SVG 点（用于笔刷显示）
  const lastSvgPointRef = useRef<SvgPoint | null>(null);
  // 是否处于笔刷模式
  const brushModeRef = useRef(false);
  // 笔刷路径（SVG 坐标，仅用于绘制轨迹）
  const brushSvgPathRef = useRef<SvgPoint[]>([]);

  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [brushPath, setBrushPath] = useState<SvgPoint[]>([]);

  // ── 派生数据 ────────────────────────────────────────────────────────────────

  const annotatedMarkup = useMemo(
    () => annotateSvgMarkup(svgMarkup, document),
    [document, svgMarkup],
  );

  /** 过滤出 candidateNodeIds 包含的 line/path 节点列表（几何命中用） */
  const candidateNodes = useMemo<EditorNode[]>(
    () =>
      document.scene.order
        .map((id) => document.scene.nodes[id])
        .filter(
          (node): node is EditorNode =>
            Boolean(node) &&
            candidateNodeIds.has(node.id) &&
            (node.fabricObject.type === "line" ||
              node.fabricObject.type === "path"),
        ),
    [document, candidateNodeIds],
  );

  // ── 视觉高亮同步 ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const elements = Array.from(
      root.querySelectorAll<SVGElement>('[data-business-command-line="true"]'),
    );
    elements.forEach((element) => {
      const nodeId = element.getAttribute("data-node-id") ?? "";
      const originalStroke =
        element.getAttribute("data-original-stroke") || "#111827";
      const originalWidth =
        Number(element.getAttribute("data-original-stroke-width") || "1") || 1;
      const lineInfo = lineHighlightMap.get(nodeId);
      const isUsed = lineInfo?.isUsed ?? false; // 已锁定（已完成区域）
      const isCurrentSelected = Boolean(lineInfo && !lineInfo.isUsed); // 当前区域已勾选
      const isHovered = hoveredLineId === nodeId && !isUsed;
      const isIdle = !isUsed && !isCurrentSelected && !isHovered; // 未选中普通线条

      // ── stroke 颜色 ───────────────────────────────────────────────────────
      element.setAttribute("stroke", lineInfo?.color || originalStroke);

      // ── stroke 宽度：已选/悬停显著加粗，普通线条保持原宽 ────────────────
      let width: number;
      if (isCurrentSelected) {
        // 至少 3.5px，或原宽 ×2.2，取更大值——让细线也明显可见
        width = Math.max(originalWidth * 2.2, 3.5);
      } else if (isHovered) {
        width = Math.max(originalWidth * 1.6, 2.5);
      } else if (isUsed) {
        // 已锁定区域：略粗，用颜色区分
        width = Math.max(originalWidth * 1.4, 2);
      } else {
        width = originalWidth;
      }
      element.setAttribute("stroke-width", String(width));

      // ── 透明度：未选中线条压暗，已选/悬停全亮，形成强对比 ────────────────
      let opacity: string;
      if (isCurrentSelected) {
        opacity = "1";
      } else if (isHovered) {
        opacity = "0.95";
      } else if (isUsed) {
        opacity = "0.75";
      } else if (isIdle) {
        // 未选中的线条半透明，让已选线条在视觉上跳出来
        opacity = "0.35";
      } else {
        opacity = "0.86";
      }
      element.setAttribute("opacity", opacity);

      element.classList.toggle("businessCommandLineCurrent", isCurrentSelected);
      element.classList.toggle("businessCommandLineUsed", isUsed);
      element.classList.toggle("businessCommandLineHover", isHovered);
    });
  }, [annotatedMarkup, lineHighlightMap, hoveredLineId]);

  // ── 手势辅助 ─────────────────────────────────────────────────────────────────

  const getSvgRoot = () =>
    rootRef.current?.querySelector<SVGSVGElement>("svg") ?? null;

  const clearGestureState = () => {
    activePointerIdRef.current = null;
    visitedRef.current = new Set();
    pressStartRef.current = null;
    lastClientPointRef.current = null;
    lastSvgPointRef.current = null;
    brushModeRef.current = false;
    brushSvgPathRef.current = [];
    setBrushPath([]);
  };

  const activateBrushMode = (svgRoot: SVGSVGElement, clientPoint: SvgPoint) => {
    brushModeRef.current = true;
    const svgPoint = clientToSvgPoint(svgRoot, clientPoint.x, clientPoint.y);
    if (svgPoint) {
      brushSvgPathRef.current = [svgPoint];
      setBrushPath([svgPoint]);
    }
  };

  if (!annotatedMarkup.trim()) return null;

  // ── 渲染 ─────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={rootRef}
      className="businessCommandSurface"
      onPointerDown={(event) => {
        event.preventDefault();
        activePointerIdRef.current = event.pointerId;
        visitedRef.current = new Set();
        brushModeRef.current = false;
        brushSvgPathRef.current = [];
        setBrushPath([]);

        const clientPoint = { x: event.clientX, y: event.clientY };
        pressStartRef.current = clientPoint;
        lastClientPointRef.current = clientPoint;

        const svgRoot = getSvgRoot();
        if (svgRoot) {
          const svgPoint = clientToSvgPoint(
            svgRoot,
            clientPoint.x,
            clientPoint.y,
          );
          lastSvgPointRef.current = svgPoint;

          // 更新悬停高亮
          setHoveredLineId(
            resolveHoveredLineId(
              svgRoot,
              clientPoint.x,
              clientPoint.y,
              candidateNodes,
            ),
          );
        }

        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        event.preventDefault();
        const current = { x: event.clientX, y: event.clientY };

        // 非激活 pointer：只更新悬停高亮
        if (activePointerIdRef.current !== event.pointerId) {
          const svgRoot = getSvgRoot();
          if (svgRoot) {
            setHoveredLineId(
              resolveHoveredLineId(
                svgRoot,
                current.x,
                current.y,
                candidateNodes,
              ),
            );
          }
          return;
        }

        const previous = lastClientPointRef.current;
        if (!previous) {
          lastClientPointRef.current = current;
          return;
        }

        const svgRoot = getSvgRoot();
        if (!svgRoot) {
          lastClientPointRef.current = current;
          return;
        }

        // ── 笔刷模式激活检测 ──────────────────────────────────────────────────
        // 只要移动超过阈值距离，立即切换为笔刷模式，无需任何延迟
        if (!brushModeRef.current) {
          const pressStart = pressStartRef.current ?? previous;
          const travelDistance = Math.hypot(
            current.x - pressStart.x,
            current.y - pressStart.y,
          );
          if (travelDistance > BRUSH_ACTIVATE_DISTANCE) {
            activateBrushMode(svgRoot, pressStart);
          }
        }

        const curSvgPoint = clientToSvgPoint(svgRoot, current.x, current.y);
        if (!curSvgPoint) {
          lastClientPointRef.current = current;
          return;
        }

        if (brushModeRef.current) {
          const prevSvgPoint = lastSvgPointRef.current;

          if (prevSvgPoint) {
            // ── 几何求交：笔刷新增线段与所有候选线做线段相交检测 ────────────
            const newHits = hitTestBrushSegment(
              prevSvgPoint,
              curSvgPoint,
              candidateNodes,
              visitedRef.current,
            );
            for (const hit of newHits) {
              visitedRef.current.add(hit.nodeId);
              onToggleLine(hit.nodeId, hit.hitPoint);
            }
          }

          // 追加笔刷轨迹显示
          brushSvgPathRef.current = [...brushSvgPathRef.current, curSvgPoint];
          setBrushPath([...brushSvgPathRef.current]);
        }

        lastClientPointRef.current = current;
        lastSvgPointRef.current = curSvgPoint;

        setHoveredLineId(
          resolveHoveredLineId(svgRoot, current.x, current.y, candidateNodes),
        );
      }}
      onPointerUp={(event) => {
        if (activePointerIdRef.current !== event.pointerId) return;
        event.preventDefault();

        const wasBrushMode = brushModeRef.current;
        const upPoint = { x: event.clientX, y: event.clientY };

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        if (!wasBrushMode) {
          // ── 单击模式：几何近邻命中 ──────────────────────────────────────────
          const svgRoot = getSvgRoot();
          if (svgRoot) {
            const hit = hitTestSingleClick(
              svgRoot,
              upPoint.x,
              upPoint.y,
              candidateNodes,
              visitedRef.current,
            );
            if (hit) {
              onToggleLine(hit.nodeId, hit.hitPoint);
            }
          }
        }

        const svgRoot = getSvgRoot();
        clearGestureState();
        if (svgRoot) {
          setHoveredLineId(
            resolveHoveredLineId(svgRoot, upPoint.x, upPoint.y, candidateNodes),
          );
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
            points={brushPath.map((point) => `${point.x},${point.y}`).join(" ")}
          />
        ) : null}
        {previewLabels.map((label) => (
          <text
            key={label.key}
            className="businessCommandMarkerText"
            x={label.x}
            y={label.y}
            fill="#111111"
          >
            {label.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
