import type {
  AnnotationField,
  DocumentState,
  EditorNode,
  SerializedFabricObject,
  标注样式,
} from "./types";

export type DomainAnnotationStyleField = Exclude<AnnotationField, "区域">;

export const DEFAULT_ANNOTATION_BORDER_STYLE = {
  边框形状: "方形",
  边框颜色: "#111111",
  背景颜色: "#ffffff",
  是否透明: false,
} as const;

export const DEFAULT_ANNOTATION_STYLE: 标注样式 = {
  字体: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  字号: 24,
  字色: "#111111",
};

function isDomainAnnotationStyleField(
  field: AnnotationField,
): field is DomainAnnotationStyleField {
  return field !== "区域";
}

function readString(
  obj: SerializedFabricObject,
  key: keyof SerializedFabricObject,
  fallback: string,
) {
  const value = obj[key];
  return typeof value === "string" ? value : fallback;
}

function readNumber(
  obj: SerializedFabricObject,
  key: keyof SerializedFabricObject,
  fallback: number,
) {
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function getDomainAnnotationStyle(
  node: EditorNode,
  domainStyles: DocumentState["domain"]["标注样式"],
) {
  if (node.business.type !== "标注") return undefined;
  if (!isDomainAnnotationStyleField(node.business.字段)) return undefined;
  return domainStyles[node.business.字段];
}

export function resolveNodeAnnotationStyle(
  node: EditorNode,
  domainStyles: DocumentState["domain"]["标注样式"],
): 标注样式 {
  const domainStyle = getDomainAnnotationStyle(node, domainStyles);
  const localStyle = node.appearance?.标注样式;
  const defaultBorder = DEFAULT_ANNOTATION_BORDER_STYLE;
  const domainBorder = domainStyle?.有边框;
  const localBorder = localStyle?.有边框;
  const resolvedBorder = localBorder
    ? {
        ...defaultBorder,
        ...domainBorder,
        ...localBorder,
      }
    : domainBorder
      ? {
          ...defaultBorder,
          ...domainBorder,
        }
      : undefined;

  return {
    字体:
      localStyle?.字体 ??
      domainStyle?.字体 ??
      readString(
        node.fabricObject,
        "fontFamily",
        DEFAULT_ANNOTATION_STYLE.字体,
      ),
    字号:
      localStyle?.字号 ??
      domainStyle?.字号 ??
      readNumber(node.fabricObject, "fontSize", DEFAULT_ANNOTATION_STYLE.字号),
    字色:
      localStyle?.字色 ??
      domainStyle?.字色 ??
      readString(node.fabricObject, "fill", DEFAULT_ANNOTATION_STYLE.字色),
    有边框: resolvedBorder,
  };
}
