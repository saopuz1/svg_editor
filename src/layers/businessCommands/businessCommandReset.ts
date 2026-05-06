import { createDefaultLineBusiness } from "../data/business";
import type { AnnotationField, DocumentState, EditorNode } from "../data/types";

type CarlineNode = EditorNode & {
  business: Extract<EditorNode["business"], { type: "车线" }>;
};

const EXTRACT_CARLINE_RESET_FIELDS = new Set<AnnotationField>([
  "车线编号",
  "档位",
  "单双",
  "DML",
]);
const MARK_GEAR_RESET_FIELDS = new Set<AnnotationField>(["档位"]);
const MARK_ODD_EVEN_RESET_FIELDS = new Set<AnnotationField>(["单双"]);

function removeAnnotationNodes(
  document: DocumentState,
  fields: ReadonlySet<AnnotationField>,
) {
  const nextNodes = Object.fromEntries(
    Object.entries(document.scene.nodes).filter(([, node]) => {
      if (node.business.type !== "标注") return true;
      return !fields.has(node.business.字段);
    }),
  );

  const nextOrder = document.scene.order.filter((id) => {
    const node = document.scene.nodes[id];
    if (!node || node.business.type !== "标注") return true;
    return !fields.has(node.business.字段);
  });

  return {
    ...document,
    scene: {
      ...document.scene,
      nodes: nextNodes,
      order: nextOrder,
    },
  };
}

function mapCarlineNodes(
  document: DocumentState,
  recipe: (node: CarlineNode) => EditorNode,
) {
  const nextNodes = { ...document.scene.nodes };

  for (const id of document.scene.order) {
    const node = nextNodes[id];
    if (!node || node.business.type !== "车线") continue;
    nextNodes[id] = recipe(node as CarlineNode);
  }

  return {
    ...document,
    scene: {
      ...document.scene,
      nodes: nextNodes,
    },
  };
}

export function resetDocumentForExtractCarline(document: DocumentState) {
  const withoutAnnotations = removeAnnotationNodes(
    document,
    EXTRACT_CARLINE_RESET_FIELDS,
  );

  const resetCarlines = mapCarlineNodes(withoutAnnotations, (node) => ({
    ...node,
    business: createDefaultLineBusiness(),
  }));

  return {
    ...resetCarlines,
    domain: {
      ...resetCarlines.domain,
      车线: [],
    },
  };
}

export function resetDocumentForMarkGear(document: DocumentState) {
  const withoutAnnotations = removeAnnotationNodes(
    document,
    MARK_GEAR_RESET_FIELDS,
  );
  const resetCarlines = mapCarlineNodes(withoutAnnotations, (node) => ({
    ...node,
    business: {
      ...node.business,
      档位: "",
    },
  }));

  return {
    ...resetCarlines,
    domain: {
      ...resetCarlines.domain,
      车线: resetCarlines.domain.车线.map((carline) => ({
        ...carline,
        档位: "",
      })),
    },
  };
}

export function resetDocumentForMarkOddEven(document: DocumentState) {
  const withoutAnnotations = removeAnnotationNodes(
    document,
    MARK_ODD_EVEN_RESET_FIELDS,
  );
  const resetCarlines = mapCarlineNodes(withoutAnnotations, (node) => ({
    ...node,
    business: {
      ...node.business,
      是双数: false,
    },
  }));

  return {
    ...resetCarlines,
    domain: {
      ...resetCarlines.domain,
      车线: resetCarlines.domain.车线.map((carline) => ({
        ...carline,
        是双数: false,
      })),
    },
  };
}
