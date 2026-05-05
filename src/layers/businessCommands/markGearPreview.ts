import type { DocumentState, EditorNode, NodeId } from "../data/types";
import type {
  MarkGearSelectedLine,
  MarkGearSession,
} from "./businessCommandTypes";

const PREVIEW_GEAR_LABEL_PREFIX = "__preview__/mark-gear/label/";

// ─── 预览标注节点 ─────────────────────────────────────────────────────────────

function createGearPreviewLabelNode(
  nodeId: NodeId,
  gearNumber: number,
  hitPoint: { x: number; y: number },
): EditorNode {
  return {
    id: `${PREVIEW_GEAR_LABEL_PREFIX}${nodeId}/gear${gearNumber}`,
    name: `档位预览 ${gearNumber}`,
    locked: true,
    hidden: false,
    zIndex: 0,
    // 档位标注：受 viewState.标注文本["档位"] 控制
    business: { type: "标注", 字段: "档位", 归属车线Id: nodeId },
    fabricObject: {
      type: "textbox",
      left: hitPoint.x,
      top: hitPoint.y,
      text: String(gearNumber),
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: 18,
      fill: "#b45309",
      width: 40,
      originX: "left",
      originY: "top",
      selectable: false,
      evented: false,
    },
  };
}

// ─── 构建预览文档 ─────────────────────────────────────────────────────────────

/**
 * 返回一个仅用于预览的 DocumentState，在已完成档位和当前档位的交点处
 * 插入数字标注节点。不修改原始 base。
 */
export function buildMarkGearPreviewDocument(
  base: DocumentState,
  session: MarkGearSession,
): { document: DocumentState; previewLabelNodeIds: NodeId[] } {
  const next = structuredClone(base);
  const previewLabelNodeIds: NodeId[] = [];
  const nextOrder = [...next.scene.order];

  // 收集所有档位（已完成 + 当前）
  const allGears: Array<{ gearNumber: number; lines: MarkGearSelectedLine[] }> =
    [
      ...session.completedGears.map((g) => ({
        gearNumber: g.gearNumber,
        lines: g.selectedLines,
      })),
      ...(session.currentLines.length > 0
        ? [
            {
              gearNumber: session.currentGearNumber,
              lines: session.currentLines,
            },
          ]
        : []),
    ];

  for (const { gearNumber, lines } of allGears) {
    for (const line of lines) {
      const labelNode = createGearPreviewLabelNode(
        line.nodeId,
        gearNumber,
        line.hitPoint,
      );
      next.scene.nodes[labelNode.id] = labelNode;
      previewLabelNodeIds.push(labelNode.id);
      nextOrder.push(labelNode.id);
    }
  }

  next.scene.order = nextOrder;
  return { document: next, previewLabelNodeIds };
}

// ─── 应用到文档（写入档位字段） ───────────────────────────────────────────────

/**
 * 将标记档位结果写入 DocumentState：
 * - 对每条被标记的车线节点，把 business.档位 更新为对应档位编号的字符串
 * - 同一节点可能在多个档位出现（取最后出现的档位，或按需扩展）
 *   本实现：以最高档位编号为准（后面的档会覆盖前面的）
 */
export function applyMarkGearSession(
  base: DocumentState,
  session: MarkGearSession,
): DocumentState {
  const { document: previewDoc } = buildMarkGearPreviewDocument(base, session);

  // 收集 nodeId → 最终档位编号（多档时取最后一次标记的档位）
  const nodeGearMap = new Map<NodeId, number>();

  const allGears: Array<{ gearNumber: number; lines: MarkGearSelectedLine[] }> =
    [
      ...session.completedGears.map((g) => ({
        gearNumber: g.gearNumber,
        lines: g.selectedLines,
      })),
      ...(session.currentLines.length > 0
        ? [
            {
              gearNumber: session.currentGearNumber,
              lines: session.currentLines,
            },
          ]
        : []),
    ];

  for (const { gearNumber, lines } of allGears) {
    for (const line of lines) {
      nodeGearMap.set(line.nodeId, gearNumber);
    }
  }

  // 把档位写入对应车线节点的 business 字段
  const nextNodes = { ...previewDoc.scene.nodes };
  for (const [nodeId, gearNumber] of nodeGearMap) {
    const node = nextNodes[nodeId];
    if (!node || node.business.type !== "车线") continue;
    nextNodes[nodeId] = {
      ...node,
      business: {
        ...node.business,
        档位: String(gearNumber),
      },
    };
  }

  // 同时更新 domain.车线 里对应的档位字段
  const nextCarlines = previewDoc.domain.车线.map((carline) => {
    const gearNumber = nodeGearMap.get(carline.id);
    if (gearNumber == null) return carline;
    return { ...carline, 档位: String(gearNumber) };
  });

  return {
    ...previewDoc,
    scene: { ...previewDoc.scene, nodes: nextNodes },
    domain: { ...previewDoc.domain, 车线: nextCarlines },
  };
}
