import type { DocumentState } from "../data/types";
import {
  EXTRACT_CARLINE_AREA_PRESETS,
  type ExtractCarlineAreaDraft,
  type ExtractCarlineAreaOptionDraft,
  type ExtractCarlineCompletedArea,
  type ExtractCarlineSelectedLine,
  type ExtractCarlineSession,
  type HitLineResult,
} from "./businessCommandTypes";

function cloneSelectedLines(lines: ExtractCarlineSelectedLine[]) {
  return lines.map((line) => ({
    nodeId: line.nodeId,
    hitPoint: { ...line.hitPoint },
  }));
}

function cloneAreaDraft(draft: ExtractCarlineAreaDraft): ExtractCarlineAreaDraft {
  return {
    areaName: draft.areaName,
    presetId: draft.presetId,
    carlineLength: draft.carlineLength,
    selectedLines: cloneSelectedLines(draft.selectedLines),
  };
}

export function createExtractCarlineSession(): ExtractCarlineSession {
  return {
    type: "提取车线",
    currentDraft: createExtractCarlineAreaDraft({
      presetId: EXTRACT_CARLINE_AREA_PRESETS[0]?.id ?? "自定义",
      areaName: EXTRACT_CARLINE_AREA_PRESETS[0]?.areaName ?? "",
      carlineLength: EXTRACT_CARLINE_AREA_PRESETS[0]?.carlineLength ?? 10,
    }),
    completedAreas: [],
  };
}

/**
 * 从 document 的已有车线节点中恢复 ExtractCarlineSession。
 * - 将所有 business.type === "车线" 的节点按区域分组，还原为 completedAreas。
 * - 自动将 currentDraft 定位到第一个尚未使用的预设，避免重复提取同一区域。
 */
export function createExtractCarlineSessionFromDocument(
  document: DocumentState,
): ExtractCarlineSession {
  // 按区域名称聚合已有车线节点
  const areaMap = new Map<
    string,
    { nodeId: string; carlineLength: number; hitPoint: { x: number; y: number } }[]
  >();

  for (const id of document.scene.order) {
    const node = document.scene.nodes[id];
    if (!node || node.business.type !== "车线") continue;
    const business = node.business;
    const areaName = business.区域;
    if (!areaMap.has(areaName)) {
      areaMap.set(areaName, []);
    }
    areaMap.get(areaName)!.push({
      nodeId: id,
      carlineLength: business.尺数,
      hitPoint: {
        x: typeof node.fabricObject.left === "number" ? node.fabricObject.left : 0,
        y: typeof node.fabricObject.top === "number" ? node.fabricObject.top : 0,
      },
    });
  }

  if (areaMap.size === 0) {
    return createExtractCarlineSession();
  }

  const completedAreas: ExtractCarlineCompletedArea[] = [];
  for (const [areaName, lines] of areaMap) {
    const carlineLength = lines[0]?.carlineLength ?? 10;
    const preset = EXTRACT_CARLINE_AREA_PRESETS.find(
      (p) => p.areaName === areaName,
    );
    completedAreas.push({
      areaName,
      presetId: preset?.id ?? "自定义",
      carlineLength,
      selectedLines: lines.map((l) => ({
        nodeId: l.nodeId,
        hitPoint: l.hitPoint,
      })),
      isRestored: true,
    });
  }

  // 自动选择第一个尚未使用的预设作为 currentDraft
  const usedAreaNames = new Set(completedAreas.map((a) => a.areaName));
  const nextPreset =
    EXTRACT_CARLINE_AREA_PRESETS.find(
      (p) => p.id !== "自定义" && !usedAreaNames.has(p.areaName),
    ) ?? EXTRACT_CARLINE_AREA_PRESETS[EXTRACT_CARLINE_AREA_PRESETS.length - 1]!;

  return {
    type: "提取车线",
    currentDraft: createExtractCarlineAreaDraft({
      presetId: nextPreset.id,
      areaName: nextPreset.id === "自定义" ? "" : nextPreset.areaName,
      carlineLength: nextPreset.carlineLength,
    }),
    completedAreas,
  };
}

export function getExtractCarlineAreaPresets() {
  return EXTRACT_CARLINE_AREA_PRESETS;
}

export function getExtractCarlineUsedAreaNames(
  session: ExtractCarlineSession,
  options?: { excludeAreaName?: string | null },
) {
  const excludeAreaName = options?.excludeAreaName ?? null;
  return session.completedAreas
    .map((area) => area.areaName)
    .filter((name) => name !== excludeAreaName);
}

export function validateExtractCarlineAreaName(
  session: ExtractCarlineSession,
  nextAreaName: string,
  options?: {
    presetId?: ExtractCarlineAreaOptionDraft["presetId"];
    excludeAreaName?: string | null;
  },
) {
  const normalized = nextAreaName.trim();
  if (normalized === "") {
    return "区域名称不能为空";
  }

  if (options?.presetId && options.presetId !== "自定义") {
    return null;
  }

  const usedNames = getExtractCarlineUsedAreaNames(session, {
    excludeAreaName: options?.excludeAreaName,
  });
  if (usedNames.includes(normalized)) {
    return "区域名称不能与当前流程已选择的区域重复";
  }
  return null;
}

export function createExtractCarlineAreaDraft(
  option: ExtractCarlineAreaOptionDraft,
): ExtractCarlineAreaDraft {
  return {
    areaName: option.areaName.trim(),
    presetId: option.presetId,
    carlineLength: option.carlineLength,
    selectedLines: [],
  };
}

function cloneCompletedAreas(areas: ExtractCarlineCompletedArea[]) {
  return areas.map((area) => cloneAreaDraft(area));
}

export function updateExtractCarlineCurrentDraft(
  session: ExtractCarlineSession,
  patch: Partial<ExtractCarlineAreaOptionDraft>,
): ExtractCarlineSession {
  return {
    ...session,
    currentDraft: {
      ...cloneAreaDraft(session.currentDraft),
      ...patch,
    },
  };
}

export function commitExtractCarlineCurrentArea(
  session: ExtractCarlineSession,
): {
  session: ExtractCarlineSession;
  validationError: string | null;
} {
  const currentDraft = cloneAreaDraft(session.currentDraft);
  const areaName = currentDraft.areaName.trim();
  const validationError = validateExtractCarlineAreaName(session, areaName, {
    presetId: currentDraft.presetId,
  });
  if (validationError) {
    return { session, validationError };
  }
  if (currentDraft.selectedLines.length === 0) {
    return {
      session,
      validationError: "当前区域还没有勾选线条",
    };
  }

  const nextCompletedAreas = [
    ...cloneCompletedAreas(session.completedAreas),
    {
      ...currentDraft,
      areaName,
    },
  ];
  const nextPreset =
    EXTRACT_CARLINE_AREA_PRESETS.find((item) => item.id !== "自定义") ??
    EXTRACT_CARLINE_AREA_PRESETS[0];

  return {
    session: {
      ...session,
      completedAreas: nextCompletedAreas,
      currentDraft: createExtractCarlineAreaDraft({
        presetId: nextPreset?.id ?? "自定义",
        areaName: nextPreset?.areaName ?? "",
        carlineLength: nextPreset?.carlineLength ?? 10,
      }),
    },
    validationError: null,
  };
}

export function toggleCurrentExtractCarlineLines(
  session: ExtractCarlineSession,
  hits: HitLineResult[],
): ExtractCarlineSession {
  if (hits.length === 0) return session;

  const nextSelectedLines = cloneSelectedLines(session.currentDraft.selectedLines);
  const sortedHits = [...hits].sort((a, b) => a.hitOrder - b.hitOrder);
  
  const usedLineIds = new Set(
    session.completedAreas.flatMap((area) => area.selectedLines.map((line) => line.nodeId)),
  );

  for (const hit of sortedHits) {
    const existingIndex = nextSelectedLines.findIndex(
      (line) => line.nodeId === hit.nodeId,
    );
    if (existingIndex >= 0) {
      nextSelectedLines.splice(existingIndex, 1);
      continue;
    }
    if (usedLineIds.has(hit.nodeId)) {
      continue;
    }
    nextSelectedLines.push({
      nodeId: hit.nodeId,
      hitPoint: { ...hit.hitPoint },
    });
  }

  return {
    ...session,
    currentDraft: {
      ...cloneAreaDraft(session.currentDraft),
      selectedLines: nextSelectedLines,
    },
  };
}
