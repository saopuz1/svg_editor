import type { DocumentState, NodeId } from "../data/types";
import type {
  HitLineResult,
  MarkGearCompletedGear,
  MarkGearSelectedLine,
  MarkGearSession,
} from "./businessCommandTypes";
import {
  DEFAULT_MARK_GEAR_LABEL_COLOR,
  resolveBusinessCommandLabelFontSize,
  resolveFirstAnnotationColor,
  resolveFirstAnnotationFontSize,
} from "./businessCommandLabelStyle";

// ─── 工厂 ─────────────────────────────────────────────────────────────────────

/**
 * 从 document 中读取所有车线节点 ID，创建初始 MarkGearSession。
 * carlineNodeIds 在 session 生命周期内不可变。
 */
export function createMarkGearSession(
  document: DocumentState,
): MarkGearSession {
  const carlineNodeIds = document.scene.order.filter((id) => {
    const node = document.scene.nodes[id];
    return node?.business.type === "车线";
  });
  const currentLabelFontSize =
    resolveFirstAnnotationFontSize(document, "档位") ??
    resolveBusinessCommandLabelFontSize(document, "档位");
  const currentLabelColor = resolveFirstAnnotationColor(
    document,
    "档位",
    DEFAULT_MARK_GEAR_LABEL_COLOR,
  );

  return {
    type: "标记档位",
    currentGearNumber: 1,
    currentLabelFontSize,
    currentLabelColor,
    currentLines: [],
    completedGears: [],
    carlineNodeIds,
  };
}

// ─── 查询 ─────────────────────────────────────────────────────────────────────

/** 所有已在已完成档位中被标记过的节点 ID（可重复出现在多档） */
export function getMarkGearUsedNodeIds(session: MarkGearSession): Set<NodeId> {
  const ids = new Set<NodeId>();
  for (const gear of session.completedGears) {
    for (const line of gear.selectedLines) {
      ids.add(line.nodeId);
    }
  }
  return ids;
}

/** 当前档位已勾选的节点 ID 集合 */
export function getMarkGearCurrentNodeIds(
  session: MarkGearSession,
): Set<NodeId> {
  return new Set(session.currentLines.map((l) => l.nodeId));
}

/**
 * 完成条件：所有车线节点在所有已完成档位 + 当前档位中均已出现。
 * 即 carlineNodeIds 中每个 id 都被标记过至少一次。
 */
export function canFinishMarkGear(session: MarkGearSession): boolean {
  if (session.carlineNodeIds.length === 0) return false;
  const allMarked = new Set<NodeId>([
    ...getMarkGearUsedNodeIds(session),
    ...getMarkGearCurrentNodeIds(session),
  ]);
  return session.carlineNodeIds.every((id) => allMarked.has(id));
}

/**
 * 当前档位是否可以进入"下一档"：
 * 当前档位至少勾选了一条线。
 */
export function canAdvanceToNextGear(session: MarkGearSession): boolean {
  return session.currentLines.length > 0;
}

// ─── 勾选切换 ────────────────────────────────────────────────────────────────

function cloneLines(lines: MarkGearSelectedLine[]): MarkGearSelectedLine[] {
  return lines.map((l) => ({ nodeId: l.nodeId, hitPoint: { ...l.hitPoint } }));
}

function cloneCompletedGears(
  gears: MarkGearCompletedGear[],
): MarkGearCompletedGear[] {
  return gears.map((gear) => ({
    ...gear,
    selectedLines: cloneLines(gear.selectedLines),
  }));
}

/**
 * 切换当前档位的勾选状态。
 * 规则：
 * - 只允许勾选 carlineNodeIds 中存在的节点
 * - 同一节点在当前档位内可取消（toggle）
 * - 已在 completedGears 中出现过的节点，不允许再次勾选（已锁定）
 */
export function toggleMarkGearLines(
  session: MarkGearSession,
  hits: HitLineResult[],
): MarkGearSession {
  if (hits.length === 0) return session;

  const carlineSet = new Set(session.carlineNodeIds);
  const usedIds = getMarkGearUsedNodeIds(session);
  const nextLines = cloneLines(session.currentLines);
  const sortedHits = [...hits].sort((a, b) => a.hitOrder - b.hitOrder);

  for (const hit of sortedHits) {
    // 只允许车线节点
    if (!carlineSet.has(hit.nodeId)) continue;
    // 已完成档位中已有的不能再选
    if (usedIds.has(hit.nodeId)) continue;

    const existingIdx = nextLines.findIndex((l) => l.nodeId === hit.nodeId);
    if (existingIdx >= 0) {
      // 已在当前档位 → 取消
      nextLines.splice(existingIdx, 1);
    } else {
      nextLines.push({ nodeId: hit.nodeId, hitPoint: { ...hit.hitPoint } });
    }
  }

  return { ...session, currentLines: nextLines };
}

// ─── 提交当前档，进入下一档 ───────────────────────────────────────────────────

/**
 * 提交当前档位，返回新 session（currentGearNumber+1，currentLines 清空）。
 * 若当前档位无勾选则返回 validationError。
 */
export function commitMarkGearCurrentGear(session: MarkGearSession): {
  session: MarkGearSession;
  validationError: string | null;
} {
  if (session.currentLines.length === 0) {
    return { session, validationError: "当前档位还没有勾选任何车线" };
  }

  const completed: MarkGearCompletedGear = {
    gearNumber: session.currentGearNumber,
    labelFontSize: session.currentLabelFontSize,
    labelColor: session.currentLabelColor,
    selectedLines: cloneLines(session.currentLines),
  };

  return {
    session: {
      ...session,
      currentGearNumber: session.currentGearNumber + 1,
      currentLabelFontSize: session.currentLabelFontSize,
      currentLabelColor: session.currentLabelColor,
      currentLines: [],
      completedGears: [...session.completedGears, completed],
    },
    validationError: null,
  };
}

// ─── 构建"用于命中过滤"的候选节点 ID 集合 ────────────────────────────────────

/**
 * 返回当前档位允许命中的节点 ID 集合：
 * carlineNodeIds 中排除 completedGears 已用过的（当前档位已选的仍可 toggle）。
 */
export function getMarkGearHittableNodeIds(
  session: MarkGearSession,
): Set<NodeId> {
  const usedIds = getMarkGearUsedNodeIds(session);
  const result = new Set<NodeId>();
  for (const id of session.carlineNodeIds) {
    if (!usedIds.has(id)) result.add(id);
  }
  // 当前档位已选的也允许（取消选）
  for (const line of session.currentLines) {
    result.add(line.nodeId);
  }
  return result;
}

export function updateMarkGearLabelPosition(
  session: MarkGearSession,
  nodeId: NodeId,
  hitPoint: { x: number; y: number },
): MarkGearSession {
  let changed = false;
  const completedGears = cloneCompletedGears(session.completedGears).map(
    (gear) => ({
      ...gear,
      selectedLines: gear.selectedLines.map((line) => {
        if (line.nodeId !== nodeId) return line;
        changed = true;
        return { ...line, hitPoint: { ...hitPoint } };
      }),
    }),
  );
  const currentLines = cloneLines(session.currentLines).map((line) => {
    if (line.nodeId !== nodeId) return line;
    changed = true;
    return { ...line, hitPoint: { ...hitPoint } };
  });

  if (!changed) return session;

  return {
    ...session,
    completedGears,
    currentLines,
  };
}
