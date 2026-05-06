import { useEffect, useMemo, useState } from "react";
import { BusinessCommandDialog } from "../../../components/BusinessCommandDialog";
import {
  BusinessCommandSvgSurface,
  type LineHighlightInfo,
  type SurfaceLabelItem,
} from "../surfaces/BusinessCommandSvgSurface";
import {
  EXTRACT_CARLINE_AREA_PRESETS,
  type ExtractCarlineSession,
} from "../businessCommandTypes";
import {
  applyExtractCarlineSession,
  getAreaColor,
} from "../extractCarlinePreview";
import {
  commitExtractCarlineCurrentArea,
  createExtractCarlineSession,
  createExtractCarlineSessionFromDocument,
  removeCurrentExtractCarlineLine,
  toggleCurrentExtractCarlineLines,
  updateExtractCarlineLabelPosition,
  updateExtractCarlineCurrentDraft,
  validateExtractCarlineAreaName,
} from "../extractCarlineSession";
import {
  MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE,
  MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE,
  clampBusinessCommandLabelFontSize,
} from "../businessCommandLabelStyle";
import { resetDocumentForExtractCarline } from "../businessCommandReset";
import {
  createBusinessCommandConfirmDialog,
  type BusinessCommandCanvasHostProps,
  type BusinessCommandConfirmState,
} from "./businessCommandHostShared";

export function ExtractCarlineHost({
  open,
  document,
  svgMarkup,
  viewportTransform,
  onDocumentChange,
  onClose,
  onCommit,
}: BusinessCommandCanvasHostProps) {
  const [session, setSession] = useState<ExtractCarlineSession | null>(null);
  const [validationError, setValidationError] = useState("");
  const [confirmState, setConfirmState] =
    useState<BusinessCommandConfirmState>(null);

  useEffect(() => {
    if (!open) {
      setSession(null);
      setValidationError("");
      setConfirmState(null);
      return;
    }
    setSession(createExtractCarlineSessionFromDocument(document));
    setValidationError("");
    setConfirmState(null);
  }, [document, open]);

  const confirmDialog = useMemo(
    () =>
      createBusinessCommandConfirmDialog({
        confirmState,
        restartText:
          "重新开始会清空当前流程以及已经写入画布的提取结果，并回到初始状态。",
        onCancel: () => setConfirmState(null),
        onExit: () => {
          setConfirmState(null);
          onClose();
        },
        onRestart: () => {
          const nextDocument = resetDocumentForExtractCarline(document);
          onDocumentChange(nextDocument);
          setSession(createExtractCarlineSession(nextDocument));
          setValidationError("");
          setConfirmState(null);
        },
      }),
    [confirmState, document, onClose, onDocumentChange],
  );

  const currentDraft = session?.currentDraft ?? null;
  const liveValidationError =
    session && currentDraft
      ? validateExtractCarlineAreaName(session, currentDraft.areaName, {
          presetId: currentDraft.presetId,
        })
      : null;
  const currentValidationError = validationError || liveValidationError || "";
  const hasAnyArea =
    (session?.completedAreas.length ?? 0) > 0 ||
    (currentDraft?.selectedLines.length ?? 0) > 0;
  const canCommitNextArea =
    (currentDraft?.selectedLines.length ?? 0) > 0 && !currentValidationError;
  const restoredLineCount =
    session?.completedAreas
      .filter((area) => area.isRestored)
      .reduce((sum, area) => sum + area.selectedLines.length, 0) ?? 0;
  const newCompletedAreas =
    session?.completedAreas.filter((area) => !area.isRestored) ?? [];
  const currentAreaOrderBase =
    restoredLineCount +
    newCompletedAreas.reduce((sum, area) => sum + area.selectedLines.length, 0);

  const selectPreset = (
    presetId: ExtractCarlineSession["currentDraft"]["presetId"],
  ) => {
    if (!session) return;
    const preset = EXTRACT_CARLINE_AREA_PRESETS.find(
      (item) => item.id === presetId,
    );
    if (!preset) return;
    setSession(
      updateExtractCarlineCurrentDraft(session, {
        presetId,
        areaName:
          presetId === "自定义"
            ? session.currentDraft.presetId === "自定义"
              ? session.currentDraft.areaName
              : ""
            : preset.areaName,
        carlineLength:
          presetId === "自定义"
            ? session.currentDraft.presetId === "自定义"
              ? session.currentDraft.carlineLength
              : preset.carlineLength
            : preset.carlineLength,
      }),
    );
    setValidationError("");
  };

  const bodyContent = useMemo(() => {
    if (!session || !currentDraft) return undefined;
    return (
      <div className="extractCarlinePanel">
        <div className="businessDialogSection extractCarlinePanelSection">
          <div className="extractCarlineFormGrid">
            <div className="row">
              <div className="label">区域选项</div>
              <select
                className="input"
                value={currentDraft.presetId}
                onChange={(event) =>
                  selectPreset(
                    event.currentTarget
                      .value as ExtractCarlineSession["currentDraft"]["presetId"],
                  )
                }
              >
                {EXTRACT_CARLINE_AREA_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.id === "自定义"
                      ? "自定义区域"
                      : `${preset.areaName}（车线长度 ${preset.carlineLength}）`}
                  </option>
                ))}
              </select>
            </div>

            <div className="row">
              <div className="label">车线长度</div>
              <input
                className="input"
                type="number"
                min={1}
                value={currentDraft.carlineLength}
                onChange={(event) => {
                  setSession(
                    updateExtractCarlineCurrentDraft(session, {
                      carlineLength: Number(event.currentTarget.value) || 0,
                    }),
                  );
                }}
              />
            </div>

            <div className="row">
              <div className="label">编号字号</div>
              <input
                className="input"
                type="number"
                min={MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE}
                max={MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE}
                value={currentDraft.labelFontSize}
                onChange={(event) => {
                  setSession(
                    updateExtractCarlineCurrentDraft(session, {
                      labelFontSize: clampBusinessCommandLabelFontSize(
                        Number(event.currentTarget.value),
                      ),
                    }),
                  );
                }}
              />
            </div>
          </div>

          <div className="row extractCarlineAreaNameRow">
            <div className="label">区域名称</div>
            <input
              className="input"
              value={currentDraft.areaName}
              disabled={currentDraft.presetId !== "自定义"}
              onChange={(event) => {
                setSession(
                  updateExtractCarlineCurrentDraft(session, {
                    areaName: event.currentTarget.value,
                  }),
                );
                setValidationError("");
              }}
              placeholder="请输入区域名称"
            />
          </div>

          {currentValidationError ? (
            <div className="businessDialogError">{currentValidationError}</div>
          ) : null}
        </div>

        <div className="businessDialogSection extractCarlinePanelSection">
          <div className="extractCarlineSummaryGrid">
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">当前区域</div>
              <div className="businessDialogMetaValue">
                {currentDraft.areaName || "-"}
              </div>
            </div>
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">车线长度</div>
              <div className="businessDialogMetaValue">
                {currentDraft.carlineLength}
              </div>
            </div>
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">当前已选</div>
              <div className="businessDialogMetaValue">
                {currentDraft.selectedLines.length}
              </div>
            </div>
          </div>

          <div className="businessDialogHint extractCarlineHint">
            点击线条就是单选切换；按住后拖动会出现刷选轨迹，并沿轨迹连续勾选线条。悬停和已选线条都会高亮。
          </div>
        </div>

        <div className="extractCarlineListsGrid">
          <div className="businessDialogSection extractCarlinePanelSection">
            <div className="businessDialogFieldLabel">当前已选线条</div>
            <div className="businessDialogSelectionList extractCarlineSelectionList">
              {currentDraft.selectedLines.length ? (
                currentDraft.selectedLines.map((line, index) => (
                  <div
                    key={line.nodeId}
                    className="businessDialogSelectionItem extractCarlineSelectionItem"
                  >
                    <span>{currentAreaOrderBase + index + 1}</span>
                    <div className="businessDialogSelectionContent">
                      <span className="businessDialogSelectionText">
                        {line.nodeId}
                      </span>
                      <button
                        type="button"
                        className="businessDialogSelectionAction"
                        onClick={() => {
                          setSession((prev) =>
                            prev
                              ? removeCurrentExtractCarlineLine(
                                  prev,
                                  line.nodeId,
                                )
                              : prev,
                          );
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted">当前区域还没有勾选线条。</div>
              )}
            </div>
          </div>

          <div className="businessDialogSection extractCarlinePanelSection">
            <div className="businessDialogFieldLabel">已勾选区域</div>
            <div className="businessDialogSelectionList extractCarlineSelectionList">
              {session.completedAreas.length ? (
                session.completedAreas.map((area) => (
                  <div
                    key={`${area.areaName}-${area.selectedLines.length}`}
                    className="businessDialogSelectionItem extractCarlineSelectionItem"
                  >
                    <span>{area.areaName}</span>
                    <span>
                      {area.selectedLines.length} 条线 / {area.labelFontSize}px
                    </span>
                  </div>
                ))
              ) : (
                <div className="muted">还没有进入下一个区域。</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }, [currentDraft, currentValidationError, session]);

  const footerContent = useMemo(() => {
    if (!session) return undefined;
    return (
      <div className="businessDialogFooter">
        <div className="businessDialogFooterLeft">
          <span className="muted">当前区域与刷线为同一步。</span>
        </div>
        <div className="businessDialogFooterRight">
          <button
            type="button"
            className="btn"
            onClick={() => setConfirmState("restart")}
          >
            重新开始
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setConfirmState("exit")}
          >
            退出
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const hasCurrentSelection =
                session.currentDraft.selectedLines.length > 0;
              const result = hasCurrentSelection
                ? commitExtractCarlineCurrentArea(session)
                : { session, validationError: null };
              if (result.validationError) {
                setValidationError(result.validationError);
                return;
              }
              if (result.session.completedAreas.length === 0) {
                if (session.currentDraft.selectedLines.length > 0) {
                  onCommit(applyExtractCarlineSession(document, session));
                }
                return;
              }
              onCommit(applyExtractCarlineSession(document, result.session));
            }}
            disabled={!hasAnyArea}
          >
            完成
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={() => {
              const result = commitExtractCarlineCurrentArea(session);
              setSession(result.session);
              setValidationError(result.validationError ?? "");
            }}
            disabled={!canCommitNextArea}
          >
            下一个区域
          </button>
        </div>
      </div>
    );
  }, [canCommitNextArea, document, hasAnyArea, onCommit, session]);

  const candidateNodeIds = useMemo<ReadonlySet<string>>(() => {
    const ids = new Set<string>();
    if (session) {
      for (const id of document.scene.order) {
        const node = document.scene.nodes[id];
        if (
          node &&
          node.business.type !== "车线" &&
          (node.fabricObject.type === "line" ||
            node.fabricObject.type === "path")
        ) {
          ids.add(node.id);
        }
      }
    }
    return ids;
  }, [document, session]);

  const lineHighlightMap = useMemo<
    ReadonlyMap<string, LineHighlightInfo>
  >(() => {
    const map = new Map<string, LineHighlightInfo>();
    if (!session) return map;
    session.completedAreas.forEach((area, index) => {
      const color = getAreaColor(index);
      area.selectedLines.forEach((line) => {
        map.set(line.nodeId, { color, isUsed: true });
      });
    });
    const currentColor = getAreaColor(session.completedAreas.length);
    session.currentDraft.selectedLines.forEach((line) => {
      map.set(line.nodeId, { color: currentColor, isUsed: false });
    });
    return map;
  }, [session]);

  const previewLabels = useMemo<SurfaceLabelItem[]>(() => {
    if (!session) return [];
    let globalOrder = restoredLineCount;
    const completed = newCompletedAreas.flatMap((area, index) => {
      const color = getAreaColor(index);
      return area.selectedLines.map((line) => {
        globalOrder += 1;
        return {
          key: `${area.areaName}-${line.nodeId}`,
          nodeId: line.nodeId,
          text: String(globalOrder),
          x: line.hitPoint.x,
          y: line.hitPoint.y,
          color,
          fontSize: area.labelFontSize,
        };
      });
    });
    const currentColor = getAreaColor(newCompletedAreas.length);
    const current = session.currentDraft.selectedLines.map((line) => {
      globalOrder += 1;
      return {
        key: `${session.currentDraft.areaName}-${line.nodeId}`,
        nodeId: line.nodeId,
        text: String(globalOrder),
        x: line.hitPoint.x,
        y: line.hitPoint.y,
        color: currentColor,
        fontSize: session.currentDraft.labelFontSize,
      };
    });
    return [...completed, ...current];
  }, [newCompletedAreas, restoredLineCount, session]);

  if (!open || !session) return null;

  return (
    <>
      <BusinessCommandSvgSurface
        document={document}
        svgMarkup={svgMarkup}
        viewportTransform={viewportTransform}
        candidateNodeIds={candidateNodeIds}
        lineHighlightMap={lineHighlightMap}
        previewLabels={previewLabels}
        onMoveLabel={(nodeId, markerPos) => {
          setSession((prev) =>
            prev
              ? updateExtractCarlineLabelPosition(prev, nodeId, markerPos)
              : prev,
          );
        }}
        onToggleLine={(nodeId, markerPos) => {
          setSession((prev) =>
            prev
              ? toggleCurrentExtractCarlineLines(prev, [
                  {
                    nodeId,
                    hitPoint: markerPos,
                    hitOrder: prev.currentDraft.selectedLines.length,
                  },
                ])
              : prev,
          );
        }}
      />
      <BusinessCommandDialog
        open={open}
        title="提取车线"
        summary="业务命令模式使用独立 SVG 命中层，不走普通编辑选中态。"
        confirmDialog={confirmDialog}
        onRequestClose={() => setConfirmState("exit")}
        bodyContent={bodyContent}
        footerContent={footerContent}
      />
    </>
  );
}
