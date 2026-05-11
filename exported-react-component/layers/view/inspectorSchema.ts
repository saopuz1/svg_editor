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
  | "textContent"
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
  const isTextNode = isTextLikeNode(node);
  const sections: InspectorSection[] = [
    {
      id: "basic",
      title: "基础属性",
      fields: ["id", "left", "top", "locked"],
    },
  ];

  if (isTextNode) {
    sections[0].fields.push("textContent");
  }

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
      "carlineArea",
      "carlineCode",
      "carlineSize",
      "carlineGear",
      "carlineDml",
      "carlineIsEven",
      "carlineAnnotationNodeIds",
    );
  }
  if (isTextNode && node.business.type === "标注") {
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

  if (isTextNode) {
    const isAnnotationText = node.business.type === "标注";
    sections.push({
      id: "annotationStyle",
      title: isAnnotationText ? "标注样式" : "文本样式",
      fields: isAnnotationText
        ? [
            "annotationStyleFontFamily",
            "annotationStyleFontSize",
            "annotationStyleTextColor",
            "annotationStyleHasBorder",
            "annotationStyleBorderTransparent",
            "annotationStyleBorderBackgroundColor",
            "annotationStyleBorderShape",
            "annotationStyleBorderColor",
          ]
        : [
            "annotationStyleFontFamily",
            "annotationStyleFontSize",
            "annotationStyleTextColor",
          ],
    });
  }

  return sections;
}
