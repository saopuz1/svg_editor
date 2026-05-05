import { createDefaultCarlineBusiness } from "../data/business";
import type { DocumentState, EditorNode, NodeId } from "../data/types";
import type {
  ExtractCarlineAreaDraft,
  ExtractCarlinePreviewResult,
  PreviewLabelNodeSpec,
  ExtractCarlineSession,
} from "./businessCommandTypes";
import { createAnnotationNodeIdMap } from "../data/idRules";

const PREVIEW_LABEL_NODE_PREFIX = "__preview__/extract-carline/label/";

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
): PreviewLabelNodeSpec[] {
  return areaDraft.selectedLines.map((selectedLine, index) => ({
    id: `${PREVIEW_LABEL_NODE_PREFIX}${areaDraft.areaName}/${selectedLine.nodeId}`,
    lineNodeId: selectedLine.nodeId,
    text: String(index + 1),
    position: { ...selectedLine.hitPoint },
    areaName: areaDraft.areaName,
  }));
}

function createPreviewLabelNode(spec: PreviewLabelNodeSpec): EditorNode {
  return {
    id: spec.id,
    name: `预览编号 ${spec.text}`,
    locked: true,
    hidden: false,
    zIndex: 0,
    business: { type: "非标注" },
    fabricObject: {
      type: "textbox",
      left: spec.position.x,
      top: spec.position.y,
      text: spec.text,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: 18,
      fill: "#007acc",
      width: 40,
      originX: "left",
      originY: "top",
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
) {
  const nextNodes = { ...nodes };
  const previewLabels = buildPreviewLabelSpecs(areaDraft);

  areaDraft.selectedLines.forEach((selectedLine, index) => {
    const node = nextNodes[selectedLine.nodeId];
    if (!node || !isExtractableLineNode(node)) return;
    nextNodes[selectedLine.nodeId] = createPreviewCarlineNode(
      node,
      areaDraft,
      index + 1,
    );
  });

  return {
    nextNodes,
    previewLabels,
  };
}

function getPreviewAreas(session: ExtractCarlineSession) {
  const areas: ExtractCarlineAreaDraft[] = session.completedAreas.map(
    (area) => ({
      ...area,
      selectedLines: area.selectedLines.map((line) => ({
        nodeId: line.nodeId,
        hitPoint: { ...line.hitPoint },
      })),
    }),
  );

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

  for (const areaDraft of getPreviewAreas(session)) {
    const areaPreview = buildAreaPreview(next.scene.nodes, areaDraft);
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

function generateCarlineId(): string {
  return `carline-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function applyExtractCarlineSession(
  base: DocumentState,
  session: ExtractCarlineSession,
): DocumentState {
  const result = buildExtractCarlinePreviewDocument(base, session);
  const nextDocument = result.document;

  const carlines: DocumentState["domain"]["车线"] = [];
  let globalOrder = 0;

  for (const areaDraft of getPreviewAreas(session)) {
    for (const _selectedLine of areaDraft.selectedLines) {
      globalOrder++;
      carlines.push({
        id: generateCarlineId(),
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
