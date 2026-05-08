import type { DocumentState, EditorNode, NodeId } from "../data/types";
import { ensureAnnotationNodeId } from "../data/idRules";
import type {
  HitLineResult,
  MarkOddEvenSelectedLine,
  MarkOddEvenSession,
} from "./businessCommandTypes";
import { resolveExtractableLineGeometry } from "./extractCarlineGeometry";
import {
  buildBusinessCommandLabelLayout,
  resolveBusinessCommandAnnotationAnchor,
  resolveBusinessCommandLabelFontSize,
  resolveFirstAnnotationFontSize,
} from "./businessCommandLabelStyle";
import { resetDocumentForMarkOddEven } from "./businessCommandReset";

// ─── 创建"双"标注节点 ────────────────────────────────────────────────────────

function createDoubleAnnotationNode(
  annotationNodeId: NodeId,
  carlineNodeId: NodeId,
  hitPoint: { x: number; y: number },
  labelFontSize: number,
): EditorNode {
  return {
    id: annotationNodeId,
    name: "双数标注",
    locked: true,
    hidden: false,
    zIndex: 0,
    business: { type: "标注", 字段: "单双", 归属车线Id: carlineNodeId },
    fabricObject: {
      type: "textbox",
      text: "双",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fill: "#111111",
      ...buildBusinessCommandLabelLayout("双", hitPoint, labelFontSize),
      selectable: false,
      evented: false,
    },
  };
}

// ─── 工厂 ─────────────────────────────────────────────────────────────────────

/**
 * 计算线条几何中点，用于恢复时的 hitPoint。
 * 取所有线段的中点中最靠近几何中心的那个。
 */
function resolveLineMidpoint(node: import("../data/types").EditorNode): {
  x: number;
  y: number;
} {
  const geometry = resolveExtractableLineGeometry(node);
  if (!geometry || geometry.segments.length === 0) {
    return {
      x:
        typeof node.fabricObject.left === "number" ? node.fabricObject.left : 0,
      y: typeof node.fabricObject.top === "number" ? node.fabricObject.top : 0,
    };
  }

  // 取所有段的中点，再求均值作为几何中心
  let sumX = 0;
  let sumY = 0;
  for (const seg of geometry.segments) {
    sumX += (seg.start.x + seg.end.x) / 2;
    sumY += (seg.start.y + seg.end.y) / 2;
  }
  return {
    x: sumX / geometry.segments.length,
    y: sumY / geometry.segments.length,
  };
}

// ─── 工厂 ─────────────────────────────────────────────────────────────────────

/**
 * 从 document 中读取所有车线节点 ID，创建 MarkOddEvenSession。
 * 已标记为"双"的节点预填入 doubleLines（hitPoint 取节点 left/top）。
 */
export function createMarkOddEvenSession(
  document: DocumentState,
): MarkOddEvenSession {
  const carlineNodeIds = document.scene.order.filter((id) => {
    const node = document.scene.nodes[id];
    return node?.business.type === "车线";
  });

  // 恢复已有的双数标记，hitPoint 从已有标注节点还原（最精确），否则取几何中点
  const doubleLines: MarkOddEvenSelectedLine[] = carlineNodeIds
    .filter((id) => {
      const node = document.scene.nodes[id];
      return node?.business.type === "车线" && node.business.是双数;
    })
    .map((id) => {
      const node = document.scene.nodes[id]!;
      const annotationId =
        node.business.type === "车线"
          ? node.business.标注NodeId.单双
          : undefined;
      const annotationNode = annotationId
        ? document.scene.nodes[annotationId]
        : undefined;
      if (
        annotationNode &&
        typeof annotationNode.fabricObject.left === "number" &&
        typeof annotationNode.fabricObject.top === "number"
      ) {
        return {
          nodeId: id,
          hitPoint: resolveBusinessCommandAnnotationAnchor(annotationNode),
        };
      }
      return {
        nodeId: id,
        hitPoint: resolveLineMidpoint(node),
      };
    });

  const labelFontSize =
    resolveFirstAnnotationFontSize(document, "单双") ??
    resolveBusinessCommandLabelFontSize(document, "单双");

  return {
    type: "标记单双",
    labelFontSize,
    doubleLines,
    carlineNodeIds,
  };
}

// ─── 查询 ─────────────────────────────────────────────────────────────────────

export function getMarkOddEvenDoubleNodeIds(
  session: MarkOddEvenSession,
): Set<NodeId> {
  return new Set(session.doubleLines.map((l) => l.nodeId));
}

// ─── 勾选切换 ────────────────────────────────────────────────────────────────

/**
 * 切换一批命中线条的"双"状态。
 * - 只允许勾选 carlineNodeIds 中存在的节点
 * - 同一节点点击可取消（toggle）
 */
export function toggleMarkOddEvenLines(
  session: MarkOddEvenSession,
  hits: HitLineResult[],
): MarkOddEvenSession {
  if (hits.length === 0) return session;

  const carlineSet = new Set(session.carlineNodeIds);
  const doubleMap = new Map<NodeId, MarkOddEvenSelectedLine>(
    session.doubleLines.map((l) => [l.nodeId, l]),
  );
  const sortedHits = [...hits].sort((a, b) => a.hitOrder - b.hitOrder);

  for (const hit of sortedHits) {
    if (!carlineSet.has(hit.nodeId)) continue;
    if (doubleMap.has(hit.nodeId)) {
      doubleMap.delete(hit.nodeId);
    } else {
      doubleMap.set(hit.nodeId, { nodeId: hit.nodeId, hitPoint: hit.hitPoint });
    }
  }

  return {
    ...session,
    doubleLines: [...doubleMap.values()],
  };
}

export function updateMarkOddEvenLabelPosition(
  session: MarkOddEvenSession,
  nodeId: NodeId,
  hitPoint: { x: number; y: number },
): MarkOddEvenSession {
  let changed = false;
  const doubleLines = session.doubleLines.map((line) => {
    if (line.nodeId !== nodeId) {
      return { ...line, hitPoint: { ...line.hitPoint } };
    }
    changed = true;
    return { ...line, hitPoint: { ...hitPoint } };
  });

  if (!changed) return session;

  return {
    ...session,
    doubleLines,
  };
}

// ─── 应用到文档 ──────────────────────────────────────────────────────────────

export function buildMarkOddEvenPreviewDocument(
  base: DocumentState,
  session: MarkOddEvenSession,
): { document: DocumentState; previewLabelNodeIds: NodeId[] } {
  const doubleIds = getMarkOddEvenDoubleNodeIds(session);
  const doubleLineMap = new Map(
    session.doubleLines.map((line) => [line.nodeId, line]),
  );

  const filteredNodes = Object.fromEntries(
    Object.entries(base.scene.nodes).filter(([, node]) => {
      if (node.business.type !== "标注") return true;
      return node.business.字段 !== "单双";
    }),
  );
  const filteredOrder = base.scene.order.filter((id) => {
    const node = base.scene.nodes[id];
    if (!node || node.business.type !== "标注") return true;
    return node.business.字段 !== "单双";
  });

  const nextNodes = { ...filteredNodes };
  const nextOrder = [...filteredOrder];
  const previewLabelNodeIds: NodeId[] = [];

  for (const id of session.carlineNodeIds) {
    const node = nextNodes[id];
    if (!node || node.business.type !== "车线") continue;
    const nextAnnotationNodeId = ensureAnnotationNodeId(
      "单双",
      doubleLineMap.get(id) ? node.business.标注NodeId.单双 : undefined,
    );
    const nextAnnotationNodeIdMap = { ...node.business.标注NodeId };
    if (doubleIds.has(id)) {
      nextAnnotationNodeIdMap.单双 = nextAnnotationNodeId;
    } else {
      delete nextAnnotationNodeIdMap.单双;
    }
    nextNodes[id] = {
      ...node,
      business: {
        ...node.business,
        是双数: doubleIds.has(id),
        标注NodeId: nextAnnotationNodeIdMap,
      },
    };
  }

  for (const line of doubleLineMap.values()) {
    const carlineNode = nextNodes[line.nodeId];
    if (!carlineNode || carlineNode.business.type !== "车线") continue;
    const annotationNodeId = ensureAnnotationNodeId(
      "单双",
      carlineNode.business.标注NodeId.单双,
    );
    nextNodes[line.nodeId] = {
      ...carlineNode,
      business: {
        ...carlineNode.business,
        标注NodeId: {
          ...carlineNode.business.标注NodeId,
          单双: annotationNodeId,
        },
      },
    };
    const annotationNode = createDoubleAnnotationNode(
      annotationNodeId,
      line.nodeId,
      line.hitPoint,
      session.labelFontSize,
    );
    nextNodes[annotationNode.id] = annotationNode;
    nextOrder.push(annotationNode.id);
    previewLabelNodeIds.push(annotationNode.id);
  }

  return {
    document: {
      ...base,
      scene: {
        ...base.scene,
        nodes: nextNodes,
        order: nextOrder,
      },
    },
    previewLabelNodeIds,
  };
}

/**
 * 将勾选结果写入 DocumentState：
 * - 已勾选的车线节点 → 是双数: true
 * - 未勾选的车线节点 → 是双数: false
 */
export function applyMarkOddEvenSession(
  base: DocumentState,
  session: MarkOddEvenSession,
): DocumentState {
  const { document: previewDocument } = buildMarkOddEvenPreviewDocument(
    resetDocumentForMarkOddEven(base),
    session,
  );
  const doubleIds = getMarkOddEvenDoubleNodeIds(session);

  // 同步更新 domain.车线
  const nextCarlines = previewDocument.domain.车线.map((carline) => {
    const sceneNode = previewDocument.scene.nodes[carline.id];
    if (!session.carlineNodeIds.includes(carline.id)) return carline;
    if (!sceneNode || sceneNode.business.type !== "车线") {
      return { ...carline, 是双数: doubleIds.has(carline.id) };
    }
    return {
      ...carline,
      是双数: doubleIds.has(carline.id),
      标注NodeId: sceneNode.business.标注NodeId,
    };
  });

  return {
    ...previewDocument,
    domain: { ...previewDocument.domain, 车线: nextCarlines },
  };
}
