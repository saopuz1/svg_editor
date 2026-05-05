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
