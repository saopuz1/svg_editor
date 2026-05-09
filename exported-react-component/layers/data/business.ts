import type {
  AnnotationField,
  EditorNode,
  LineNodeBusiness,
  NodeBusiness,
  NodeId,
  TextNodeBusiness,
} from "./types";

export const DEFAULT_ANNOTATION_FIELD: AnnotationField = "区域";

export function isLineLikeFabricType(fabricType: string) {
  return fabricType === "path" || fabricType === "line";
}

export function isTextLikeFabricType(fabricType: string) {
  return fabricType === "text" || fabricType === "textbox";
}

export function isLineLikeNode(node: EditorNode) {
  return isLineLikeFabricType(node.fabricObject.type);
}

export function isTextLikeNode(node: EditorNode) {
  return isTextLikeFabricType(node.fabricObject.type);
}

export function createDefaultLineBusiness(): Extract<
  LineNodeBusiness,
  { type: "非车线" }
> {
  return { type: "非车线" };
}

export function createDefaultCarlineBusiness(
  nodeId: NodeId,
): Extract<LineNodeBusiness, { type: "车线" }> {
  return {
    type: "车线",
    id: nodeId,
    区域: "A",
    车线编号: "1",
    尺数: 10,
    档位: "1",
    标注NodeId: {},
  };
}

export function createDefaultTextBusiness(): Extract<
  TextNodeBusiness,
  { type: "非标注" }
> {
  return { type: "非标注" };
}

export function createDefaultAnnotationBusiness(
  field: AnnotationField = DEFAULT_ANNOTATION_FIELD,
): Extract<TextNodeBusiness, { type: "标注" }> {
  return {
    type: "标注",
    字段: field,
    归属车线Id: "carline",
  };
}

export function createDefaultBusinessForFabricType(
  fabricType: string,
): NodeBusiness {
  if (isLineLikeFabricType(fabricType)) {
    return createDefaultLineBusiness();
  }
  if (isTextLikeFabricType(fabricType)) {
    return createDefaultTextBusiness();
  }
  return { type: "普通" };
}

export function getAllowedBusinessTypesForFabricType(
  fabricType: string,
): NodeBusiness["type"][] {
  if (isLineLikeFabricType(fabricType)) {
    return ["非车线", "车线"];
  }
  if (isTextLikeFabricType(fabricType)) {
    return ["非标注", "标注"];
  }
  return [];
}

export function createBusinessForFabricTypeAndType(
  fabricType: string,
  type: NodeBusiness["type"],
  options?: { nodeId?: NodeId },
): NodeBusiness | null {
  if (isLineLikeFabricType(fabricType)) {
    if (type === "非车线") return createDefaultLineBusiness();
    if (type === "车线") {
      if (!options?.nodeId) return null;
      return createDefaultCarlineBusiness(options.nodeId);
    }
    return null;
  }

  if (isTextLikeFabricType(fabricType)) {
    if (type === "非标注") return createDefaultTextBusiness();
    if (type === "标注") return createDefaultAnnotationBusiness();
    return null;
  }

  if (type === "普通") return { type: "普通" };
  return null;
}
