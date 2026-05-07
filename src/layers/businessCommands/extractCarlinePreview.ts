import { createDefaultCarlineBusiness } from "../data/business";
import type { DocumentState, EditorNode, NodeId } from "../data/types";
import type {
  ExtractCarlineAreaDraft,
  ExtractCarlinePreviewResult,
  PreviewLabelNodeSpec,
  ExtractCarlineSession,
} from "./businessCommandTypes";
import { ensureLineNodeId } from "../data/idRules";
import { buildBusinessCommandLabelLayout } from "./businessCommandLabelStyle";
import { resetDocumentForExtractCarline } from "./businessCommandReset";

const PREVIEW_LABEL_NODE_PREFIX = "__preview__/extract-carline/label/";

// ─── 区域颜色序列（与 BusinessCommandHost 共用同一份，避免预览与最终标注色不一致） ────

export const AREA_COLORS = [
  "#2563eb",
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#db2777",
  "#059669",
  "#d97706",
  "#6366f1",
  "#be185d",
  "#16a34a",
];

export function getAreaColor(areaIndex: number): string {
  return AREA_COLORS[areaIndex % AREA_COLORS.length];
}

function isExtractableLineNode(node: EditorNode) {
  return node.fabricObject.type === "path" || node.fabricObject.type === "line";
}

function createPreviewCarlineNode(
  node: EditorNode,
  areaDraft: ExtractCarlineAreaDraft,
  order: number,
): EditorNode {
  const business = createDefaultCarlineBusiness(node.id);
  return {
    ...node,
    business: {
      ...business,
      编号: order,
      区域: areaDraft.areaName,
      车线编号: `${areaDraft.areaName}${String(order).padStart(2, "0")}`,
      尺数: areaDraft.carlineLength,
    },
  };
}

function buildPreviewLabelSpecs(
  areaDraft: ExtractCarlineAreaDraft,
  globalOffset: number,
): PreviewLabelNodeSpec[] {
  return areaDraft.selectedLines.map((selectedLine, index) => ({
    id: `${PREVIEW_LABEL_NODE_PREFIX}${areaDraft.areaName}/${selectedLine.nodeId}`,
    lineNodeId: selectedLine.nodeId,
    text: String(globalOffset + index + 1),
    position: { ...selectedLine.hitPoint },
    areaName: areaDraft.areaName,
    fontSize: areaDraft.labelFontSize,
    color: areaDraft.labelColor,
  }));
}

function createPreviewLabelNode(spec: PreviewLabelNodeSpec): EditorNode {
  return {
    id: spec.id,
    name: `预览编号 ${spec.text}`,
    locked: true,
    hidden: false,
    zIndex: 0,
    // business 必须设为「标注/车线编号」而非「非标注」。
    // isNodeVisible 只对 business.type === "标注" 的节点读 viewState.标注文本，
    // 「非标注」会绕过视图开关永远可见，导致取消勾选「车线编号」后标注仍然显示。
    business: { type: "标注", 字段: "车线编号", 归属车线Id: spec.lineNodeId },
    fabricObject: {
      type: "textbox",
      text: spec.text,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fill: spec.color,
      ...buildBusinessCommandLabelLayout(
        spec.text,
        spec.position,
        spec.fontSize,
      ),
      selectable: false,
      evented: false,
    },
  };
}

function createCommittedCodeLabelNode(args: {
  id: NodeId;
  carlineNodeId: NodeId;
  text: string;
  position: { x: number; y: number };
  fontSize: number;
  color: string;
}): EditorNode {
  const { id, carlineNodeId, text, position, fontSize, color } = args;
  return {
    id,
    name: `车线编号 ${text}`,
    locked: true,
    hidden: false,
    zIndex: 0,
    business: { type: "标注", 字段: "车线编号", 归属车线Id: carlineNodeId },
    fabricObject: {
      type: "textbox",
      text,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fill: color,
      ...buildBusinessCommandLabelLayout(text, position, fontSize),
      selectable: false,
      evented: false,
    },
  };
}

function cloneSceneOrder(order: NodeId[]) {
  return [...order];
}

function buildAreaPreview(
  nodes: DocumentState["scene"]["nodes"],
  areaDraft: ExtractCarlineAreaDraft,
  globalOffset: number,
) {
  const nextNodes = { ...nodes };
  const previewLabels = buildPreviewLabelSpecs(areaDraft, globalOffset);

  areaDraft.selectedLines.forEach((selectedLine, index) => {
    const node = nextNodes[selectedLine.nodeId];
    if (!node || !isExtractableLineNode(node)) return;
    nextNodes[selectedLine.nodeId] = createPreviewCarlineNode(
      node,
      areaDraft,
      globalOffset + index + 1,
    );
  });

  return {
    nextNodes,
    previewLabels,
  };
}

function getPreviewAreas(session: ExtractCarlineSession) {
  // isRestored 区域已写入 document，不再参与预览或再次提交
  const areas: ExtractCarlineAreaDraft[] = session.completedAreas
    .filter((area) => !area.isRestored)
    .map((area) => ({
      ...area,
      selectedLines: area.selectedLines.map((line) => ({
        nodeId: line.nodeId,
        hitPoint: { ...line.hitPoint },
      })),
    }));

  if (session.currentDraft.selectedLines.length > 0) {
    areas.push({
      ...session.currentDraft,
      selectedLines: session.currentDraft.selectedLines.map((line) => ({
        nodeId: line.nodeId,
        hitPoint: { ...line.hitPoint },
      })),
    });
  }

  return areas;
}

export function buildExtractCarlinePreviewDocument(
  base: DocumentState,
  session: ExtractCarlineSession,
): ExtractCarlinePreviewResult {
  const next = structuredClone(base);
  const previewLabelNodeIds: NodeId[] = [];
  const nextOrder = cloneSceneOrder(next.scene.order);

  // isRestored 区域的线条数是全局编号的起始偏移
  const restoredCount = session.completedAreas
    .filter((a) => a.isRestored)
    .reduce((sum, a) => sum + a.selectedLines.length, 0);
  let globalOffset = restoredCount;

  for (const areaDraft of getPreviewAreas(session)) {
    const areaPreview = buildAreaPreview(
      next.scene.nodes,
      areaDraft,
      globalOffset,
    );
    globalOffset += areaDraft.selectedLines.length;
    next.scene.nodes = areaPreview.nextNodes;

    for (const label of areaPreview.previewLabels) {
      const labelNode = createPreviewLabelNode(label);
      next.scene.nodes[label.id] = labelNode;
      previewLabelNodeIds.push(label.id);
      nextOrder.push(label.id);
    }
  }

  next.scene.order = nextOrder;
  return {
    document: next,
    previewLabelNodeIds,
  };
}

export function applyExtractCarlineSession(
  base: DocumentState,
  session: ExtractCarlineSession,
): DocumentState {
  const nextDocument = resetDocumentForExtractCarline(base);
  const selectedLineMap = new Map<
    NodeId,
    {
      areaDraft: ExtractCarlineAreaDraft;
      order: number;
      hitPoint: { x: number; y: number };
    }
  >();
  const carlines: DocumentState["domain"]["车线"] = [];
  const nextNodes: DocumentState["scene"]["nodes"] = {};
  const nextOrder: NodeId[] = [];

  const restoredCount = session.completedAreas
    .filter((a) => a.isRestored)
    .reduce((sum, a) => sum + a.selectedLines.length, 0);
  let globalOrder = restoredCount;

  for (const areaDraft of getPreviewAreas(session)) {
    for (const selectedLine of areaDraft.selectedLines) {
      globalOrder++;
      selectedLineMap.set(selectedLine.nodeId, {
        areaDraft,
        order: globalOrder,
        hitPoint: { ...selectedLine.hitPoint },
      });
    }
  }

  for (const id of nextDocument.scene.order) {
    const node = nextDocument.scene.nodes[id];
    if (!node) continue;
    const selected = selectedLineMap.get(id);
    if (!selected || !isExtractableLineNode(node)) {
      nextNodes[id] = node;
      nextOrder.push(id);
      continue;
    }

    const nextNodeId = ensureLineNodeId("车线", id);
    const nextCarlineBusiness = {
      ...createDefaultCarlineBusiness(nextNodeId),
      编号: selected.order,
      区域: selected.areaDraft.areaName,
      车线编号: `${selected.areaDraft.areaName}${String(selected.order).padStart(2, "0")}`,
      尺数: selected.areaDraft.carlineLength,
    };
    const nextCarlineNode: EditorNode = {
      ...node,
      id: nextNodeId,
      business: nextCarlineBusiness,
    };
    nextNodes[nextNodeId] = nextCarlineNode;
    nextOrder.push(nextNodeId);

    const codeNodeId = nextCarlineBusiness.标注NodeId.车线编号;
    nextNodes[codeNodeId] = createCommittedCodeLabelNode({
      id: codeNodeId,
      carlineNodeId: nextNodeId,
      text: String(selected.order),
      position: selected.hitPoint,
      fontSize: selected.areaDraft.labelFontSize,
      color: selected.areaDraft.labelColor,
    });
    nextOrder.push(codeNodeId);

    carlines.push({
      id: nextCarlineBusiness.id,
      编号: nextCarlineBusiness.编号,
      区域: nextCarlineBusiness.区域,
      尺数: nextCarlineBusiness.尺数,
      档位: nextCarlineBusiness.档位,
      DML: nextCarlineBusiness.DML,
      是双数: nextCarlineBusiness.是双数,
      标注NodeId: nextCarlineBusiness.标注NodeId,
    });
  }

  return {
    ...nextDocument,
    scene: {
      ...nextDocument.scene,
      nodes: nextNodes,
      order: nextOrder,
    },
    domain: {
      ...nextDocument.domain,
      车线: carlines,
    },
  };
}
