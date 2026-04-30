import type {
  AnnotationField,
  AnnotationNodeIdMap,
  EditorNode,
  NodeBusiness,
  NodeId,
} from "./types";

export const NODE_ID_PREFIX_RULES = {
  line: {
    非车线: "line",
    车线: "stitching",
  },
  text: "text",
  generic: "node",
  annotation: {
    车线编号: "stitching",
    区域: "area",
    档位: "level",
    单双: "double",
    DML: "dml",
  },
} as const;

function createPrefixedNodeId(prefix: string): NodeId {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createLineNodeId(type: "非车线" | "车线"): NodeId {
  return createPrefixedNodeId(NODE_ID_PREFIX_RULES.line[type]);
}

export function createTextNodeId(): NodeId {
  return createPrefixedNodeId(NODE_ID_PREFIX_RULES.text);
}

export function createGenericNodeId(): NodeId {
  return createPrefixedNodeId(NODE_ID_PREFIX_RULES.generic);
}

export function createAnnotationNodeId(field: AnnotationField): NodeId {
  return createPrefixedNodeId(NODE_ID_PREFIX_RULES.annotation[field]);
}

export function createAnnotationNodeIdMap(): AnnotationNodeIdMap {
  return {
    车线编号: createAnnotationNodeId("车线编号"),
    档位: createAnnotationNodeId("档位"),
    单双: createAnnotationNodeId("单双"),
    DML: createAnnotationNodeId("DML"),
  };
}

export function createNodeIdForBusiness(
  fabricType: string,
  business: NodeBusiness,
): NodeId {
  if (fabricType === "path") {
    return createLineNodeId(business.type === "车线" ? "车线" : "非车线");
  }

  if (fabricType === "text" || fabricType === "textbox") {
    if (business.type === "标注") {
      return createAnnotationNodeId(business.字段);
    }
    return createTextNodeId();
  }

  return createGenericNodeId();
}

export function shouldRegenerateNodeIdOnBusinessChange(
  node: Pick<EditorNode, "fabricObject" | "business">,
  nextBusiness: NodeBusiness,
) {
  const fabricType = node.fabricObject.type;

  if (fabricType === "path") {
    return node.business.type !== nextBusiness.type;
  }

  if (fabricType === "text" || fabricType === "textbox") {
    if (node.business.type !== nextBusiness.type) {
      return true;
    }
    if (node.business.type === "标注" && nextBusiness.type === "标注") {
      return node.business.字段 !== nextBusiness.字段;
    }
  }

  return false;
}
