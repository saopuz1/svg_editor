import type { DocumentState } from "./types";

function buildExportDomainCarlines(state: DocumentState): DocumentState["domain"]["车线"] {
  const result: DocumentState["domain"]["车线"] = [];
  for (const id of state.scene.order) {
    const node = state.scene.nodes[id];
    if (!node) continue;
    if (node.business.type !== "车线") continue;
    result.push({
      id: node.business.id,
      车线编号: node.business.车线编号,
      区域: node.business.区域,
      尺数: node.business.尺数,
      档位: node.business.档位,
      DML: node.business.DML,
      是双数: node.business.是双数,
      标注NodeId: node.business.标注NodeId,
    });
  }
  return result;
}

export function serializeDocument(state: DocumentState): string {
  return JSON.stringify(
    {
      ...state,
      domain: {
        ...state.domain,
        车线: buildExportDomainCarlines(state),
      },
    },
    null,
    2,
  );
}

function createEmptyDomain(): DocumentState["domain"] {
  return {
    车线: [],
    标注样式: {},
    自动修改器: [
      { id: crypto.randomUUID(), type: "按区域自动标注DML", 规律: ["D", "M", "L"], 范围: [] },
      { id: crypto.randomUUID(), type: "按档位自动标注DML", 规律: ["D", "M", "L"], 范围: [] },
    ],
  };
}

export function parseDocument(raw: string): DocumentState {
  const parsed = JSON.parse(raw) as unknown;

  const meta = (parsed as { meta?: unknown })?.meta as
    | { documentId?: unknown }
    | undefined;
  if (!meta?.documentId || typeof meta.documentId !== "string") {
    throw new Error("Invalid document JSON");
  }

  // Backward compatibility: migrate legacy shape to { scene, domain }.
  const p = parsed as Record<string, unknown>;
  const nextSvg =
    typeof (p as { svg?: unknown }).svg === "string"
      ? ((p as { svg?: unknown }).svg as string)
      : null;

  if (!("scene" in p) && ("nodes" in p || "order" in p || "business" in p)) {
    const legacyNodes = (p.nodes ?? {}) as Record<string, unknown>;
    const legacyOrder = (p.order ?? []) as unknown[];
    const legacyBusiness = (p.business ?? {}) as Record<string, unknown>;

    return {
      ...(p as unknown as DocumentState),
      // Explicitly override to new layout.
      scene: {
        nodes: legacyNodes as unknown as DocumentState["scene"]["nodes"],
        order: legacyOrder as unknown as DocumentState["scene"]["order"],
      },
      svg:
        typeof (legacyBusiness as { svg?: unknown }).svg === "string"
          ? ((legacyBusiness as { svg?: unknown }).svg as string)
          : (nextSvg ?? ""),
      domain: {
        ...(createEmptyDomain() as unknown as Record<string, unknown>),
        ...legacyBusiness,
      } as unknown as DocumentState["domain"],
    };
  }

  // If old "domain" contains svg, migrate it to top-level svg.
  if (
    typeof (p as { svg?: unknown }).svg !== "string" &&
    typeof (p as { domain?: unknown })?.domain === "object" &&
    p.domain !== null &&
    typeof (p.domain as { svg?: unknown }).svg === "string"
  ) {
    const domainWithSvg = p.domain as Record<string, unknown>;
    return {
      ...(p as unknown as DocumentState),
      svg: domainWithSvg.svg as string,
      domain: {
        ...(createEmptyDomain() as unknown as Record<string, unknown>),
        ...domainWithSvg,
      } as unknown as DocumentState["domain"],
    };
  }

  const doc = parsed as DocumentState;
  return {
    ...doc,
    svg: typeof doc.svg === "string" ? doc.svg : (nextSvg ?? ""),
    domain: (doc.domain ?? createEmptyDomain()) as DocumentState["domain"],
  };
}
