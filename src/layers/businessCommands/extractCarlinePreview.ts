import { createDefaultCarlineBusiness } from "../data/business";
import type { DocumentState, EditorNode, NodeId } from "../data/types";
import type {
  ExtractCarlineAreaDraft,
  ExtractCarlinePreviewResult,
  PreviewLabelNodeSpec,
  ExtractCarlineSession,
} from "./businessCommandTypes";
import { createAnnotationNodeIdMap } from "../data/idRules";
import { buildBusinessCommandLabelLayout } from "./businessCommandLabelStyle";

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
      fill: "#111111",
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
  const result = buildExtractCarlinePreviewDocument(base, session);
  const nextDocument = result.document;

  const carlines: DocumentState["domain"]["车线"] = [];
  // isRestored 区域已写入 domain，新增编号从已有车线总数后续开始
  const restoredCount = session.completedAreas
    .filter((a) => a.isRestored)
    .reduce((sum, a) => sum + a.selectedLines.length, 0);
  let globalOrder = restoredCount;

  for (const areaDraft of getPreviewAreas(session)) {
    for (const selectedLine of areaDraft.selectedLines) {
      globalOrder++;
      carlines.push({
        // Keep domain carline id aligned with the corresponding scene node id.
        id: selectedLine.nodeId,
        编号: globalOrder,
        区域: areaDraft.areaName,
        尺数: areaDraft.carlineLength,
        档位: "",
        DML: "D",
        是双数: false,
        标注NodeId: createAnnotationNodeIdMap(),
      });
    }
  }

  nextDocument.domain = {
    ...nextDocument.domain,
    车线: carlines,
  };

  return nextDocument;
}
