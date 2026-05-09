import { resolveNodeAnnotationStyle } from "../data/annotationStyles";
import type { DocumentState, EditorNode } from "../data/types";

export type BusinessCommandAnnotationField =
  | "车线编号"
  | "档位"
  | "单双"
  | "DML";

export const DEFAULT_BUSINESS_COMMAND_LABEL_FONT_SIZE = 18;
export const DEFAULT_EXTRACT_CARLINE_LABEL_COLOR = "#22c55e";
export const DEFAULT_MARK_GEAR_LABEL_COLOR = "#7c3aed";
// Allow smaller labels for dense drawings; UI inputs and clamping use this value.
export const MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE = 4;
export const MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE = 72;

const MIN_LABEL_WIDTH = 28;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readNodeFontSize(node?: EditorNode) {
  if (!node) return null;
  const fontSize = resolveNodeAnnotationStyle(node, {}).字号;
  return isFiniteNumber(fontSize)
    ? clampBusinessCommandLabelFontSize(fontSize)
    : null;
}

function isValidHexColor(value: string) {
  return /^#([0-9a-fA-F]{6})$/.test(value);
}

export function normalizeBusinessCommandLabelColor(
  value: string | null | undefined,
  fallback: string,
) {
  if (!value) return fallback;
  return isValidHexColor(value) ? value : fallback;
}

function readNodeColor(node?: EditorNode) {
  if (!node) return null;
  const color = resolveNodeAnnotationStyle(node, {}).字色;
  return typeof color === "string" && color.trim() !== "" ? color : null;
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

export function resolveBusinessCommandLabelColor(
  document: DocumentState,
  field: BusinessCommandAnnotationField,
  fallback: string,
) {
  for (const id of document.scene.order) {
    const node = document.scene.nodes[id];
    if (!node || node.business.type !== "标注") continue;
    if (node.business.字段 !== field) continue;
    const color = readNodeColor(node);
    if (color) return normalizeBusinessCommandLabelColor(color, fallback);
  }

  const configuredColor = document.domain.标注样式[field]?.字色;
  return normalizeBusinessCommandLabelColor(
    typeof configuredColor === "string" ? configuredColor : null,
    fallback,
  );
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

export function resolveFirstAnnotationColor(
  document: DocumentState,
  field: BusinessCommandAnnotationField,
  fallback: string,
) {
  for (const id of document.scene.order) {
    const node = document.scene.nodes[id];
    if (!node || node.business.type !== "标注") continue;
    if (node.business.字段 !== field) continue;
    const color = readNodeColor(node);
    if (color) return normalizeBusinessCommandLabelColor(color, fallback);
  }
  return resolveBusinessCommandLabelColor(document, field, fallback);
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

export function resolveCarlineAnnotationColor(
  document: DocumentState,
  field: BusinessCommandAnnotationField,
  carlineNodeId: string,
  fallback: string,
) {
  for (const id of document.scene.order) {
    const node = document.scene.nodes[id];
    if (!node || node.business.type !== "标注") continue;
    if (node.business.字段 !== field) continue;
    if (node.business.归属车线Id !== carlineNodeId) continue;
    const color = readNodeColor(node);
    if (color) return normalizeBusinessCommandLabelColor(color, fallback);
  }
  return resolveBusinessCommandLabelColor(document, field, fallback);
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
  const height = normalizedFontSize * 1.1;

  return {
    left: position.x - width / 2,
    top: position.y - height / 2,
    width,
    fontSize: normalizedFontSize,
    textAlign: "center" as const,
    originX: "left" as const,
    originY: "top" as const,
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
