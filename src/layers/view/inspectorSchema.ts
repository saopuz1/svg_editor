import {
  getAllowedBusinessTypesForFabricType,
  isLineLikeNode,
  isTextLikeNode,
} from "../data/business";
import type { EditorNode } from "../data/types";

export type InspectorFieldId =
  | "id"
  | "left"
  | "top"
  | "locked"
  | "annotationStyleFontFamily"
  | "annotationStyleFontSize"
  | "annotationStyleTextColor"
  | "annotationStyleHasBorder"
  | "annotationStyleBorderTransparent"
  | "annotationStyleBorderBackgroundColor"
  | "annotationStyleBorderShape"
  | "annotationStyleBorderColor"
  | "businessType"
  | "carlineId"
  | "carlineNumber"
  | "carlineArea"
  | "carlineCode"
  | "carlineSize"
  | "carlineGear"
  | "carlineDml"
  | "carlineIsEven"
  | "carlineAnnotationNodeIds"
  | "annotationField"
  | "annotationCarlineId";

export interface InspectorSection {
  id: "basic" | "business" | "annotationStyle";
  title: string;
  fields: InspectorFieldId[];
}

export function getInspectorSections(node: EditorNode): InspectorSection[] {
  const sections: InspectorSection[] = [
    {
      id: "basic",
      title: "基础属性",
      fields: ["id", "left", "top", "locked"],
    },
  ];

  const availableBusinessTypes = getAllowedBusinessTypesForFabricType(
    node.fabricObject.type,
  );
  if (availableBusinessTypes.length === 0) {
    return sections;
  }

  const businessFields: InspectorFieldId[] = ["businessType"];
  if (isLineLikeNode(node) && node.business.type === "车线") {
    businessFields.push(
      "carlineId",
      "carlineNumber",
      "carlineArea",
      "carlineCode",
      "carlineSize",
      "carlineGear",
      "carlineDml",
      "carlineIsEven",
      "carlineAnnotationNodeIds",
    );
  }
  if (isTextLikeNode(node) && node.business.type === "标注") {
    businessFields.push("annotationField", "annotationCarlineId");
  }
  if (!isLineLikeNode(node) && !isTextLikeNode(node)) {
    return sections;
  }

  sections.push({
    id: "business",
    title: "业务属性",
    fields: businessFields,
  });

  if (isTextLikeNode(node)) {
    sections.push({
      id: "annotationStyle",
      title: "标注样式",
      fields: [
        "annotationStyleFontFamily",
        "annotationStyleFontSize",
        "annotationStyleTextColor",
        "annotationStyleHasBorder",
        "annotationStyleBorderTransparent",
        "annotationStyleBorderBackgroundColor",
        "annotationStyleBorderShape",
        "annotationStyleBorderColor",
      ],
    });
  }

  return sections;
}
