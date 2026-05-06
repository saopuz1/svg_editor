import type { DocumentState, EditorNode } from "../data/types";

export type BusinessCommandAnnotationField = "车线编号" | "档位" | "单双";

export const DEFAULT_BUSINESS_COMMAND_LABEL_FONT_SIZE = 18;
export const MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE = 8;
export const MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE = 72;

const MIN_LABEL_WIDTH = 28;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readNodeFontSize(node?: EditorNode) {
  const fontSize = node?.fabricObject.fontSize;
  return isFiniteNumber(fontSize)
    ? clampBusinessCommandLabelFontSize(fontSize)
    : null;
}

function resolveOriginFactor(origin: string | undefined) {
  if (origin === "center") return 0.5;
  if (origin === "right" || origin === "bottom") return 1;
  return 0;
}

export function clampBusinessCommandLabelFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_BUSINESS_COMMAND_LABEL_FONT_SIZE;
  }
  return Math.min(
    MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE,
    Math.max(MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE, Math.round(value)),
  );
}

export function resolveBusinessCommandLabelFontSize(
  document: DocumentState,
  field: BusinessCommandAnnotationField,
) {
  const configuredFontSize = document.domain.标注样式[field]?.字号;
  return isFiniteNumber(configuredFontSize)
    ? clampBusinessCommandLabelFontSize(configuredFontSize)
    : DEFAULT_BUSINESS_COMMAND_LABEL_FONT_SIZE;
}

export function resolveFirstAnnotationFontSize(
  document: DocumentState,
  field: BusinessCommandAnnotationField,
) {
  for (const id of document.scene.order) {
    const node = document.scene.nodes[id];
    if (!node || node.business.type !== "标注") continue;
    if (node.business.字段 !== field) continue;
    const fontSize = readNodeFontSize(node);
    if (fontSize !== null) return fontSize;
  }
  return null;
}

export function resolveCarlineAnnotationFontSize(
  document: DocumentState,
  field: BusinessCommandAnnotationField,
  carlineNodeId: string,
) {
  for (const id of document.scene.order) {
    const node = document.scene.nodes[id];
    if (!node || node.business.type !== "标注") continue;
    if (node.business.字段 !== field) continue;
    if (node.business.归属车线Id !== carlineNodeId) continue;
    const fontSize = readNodeFontSize(node);
    if (fontSize !== null) return fontSize;
  }
  return null;
}

export function buildBusinessCommandLabelLayout(
  text: string,
  position: { x: number; y: number },
  fontSize: number,
) {
  const normalizedFontSize = clampBusinessCommandLabelFontSize(fontSize);
  const textLength = Math.max(text.length, 1);
  const width = Math.max(
    MIN_LABEL_WIDTH,
    normalizedFontSize * (textLength + 1),
  );

  return {
    left: position.x,
    top: position.y,
    width,
    fontSize: normalizedFontSize,
    textAlign: "center" as const,
    originX: "center" as const,
    originY: "center" as const,
  };
}

export function resolveBusinessCommandAnnotationAnchor(node: EditorNode) {
  const width = isFiniteNumber(node.fabricObject.width)
    ? node.fabricObject.width
    : MIN_LABEL_WIDTH;
  const fontSize =
    readNodeFontSize(node) ?? DEFAULT_BUSINESS_COMMAND_LABEL_FONT_SIZE;
  const height = fontSize * 1.1;
  const left = isFiniteNumber(node.fabricObject.left)
    ? node.fabricObject.left
    : 0;
  const top = isFiniteNumber(node.fabricObject.top) ? node.fabricObject.top : 0;
  const originX =
    typeof node.fabricObject.originX === "string"
      ? node.fabricObject.originX
      : "left";
  const originY =
    typeof node.fabricObject.originY === "string"
      ? node.fabricObject.originY
      : "top";

  return {
    x: left + width * (0.5 - resolveOriginFactor(originX)),
    y: top + height * (0.5 - resolveOriginFactor(originY)),
  };
}
