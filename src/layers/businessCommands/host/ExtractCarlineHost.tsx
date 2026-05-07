import { useMemo, useState } from "react";
import { BusinessCommandDialog } from "../../../components/BusinessCommandDialog";
import {
  EXTRACT_CARLINE_AREA_PRESETS,
  type ExtractCarlineSession,
} from "../businessCommandTypes";
import {
  commitExtractCarlineCurrentArea,
  removeCurrentExtractCarlineLine,
  updateExtractCarlineCurrentDraft,
  validateExtractCarlineAreaName,
} from "../extractCarlineSession";
import {
  MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE,
  MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE,
  clampBusinessCommandLabelFontSize,
  normalizeBusinessCommandLabelColor,
} from "../businessCommandLabelStyle";
import {
  createBusinessCommandConfirmDialog,
  type BusinessCommandCanvasHostProps,
  type BusinessCommandConfirmState,
} from "./businessCommandHostShared";

export function ExtractCarlineHost({
  open,
  document,
  activeCommand,
  onSessionChange,
  onClose,
  onRestart,
  onCommit,
}: BusinessCommandCanvasHostProps) {
  const [validationError, setValidationError] = useState("");
  const [confirmState, setConfirmState] =
    useState<BusinessCommandConfirmState>(null);
  const session =
    activeCommand?.kind === "extract-carline" ? activeCommand.session : null;

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
          setValidationError("");
          setConfirmState(null);
          onRestart();
        },
      }),
    [confirmState, onClose, onRestart],
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
    onSessionChange({
      kind: "extract-carline",
      session: updateExtractCarlineCurrentDraft(session, {
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
    });
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
                  onSessionChange({
                    kind: "extract-carline",
                    session: updateExtractCarlineCurrentDraft(session, {
                      carlineLength: Number(event.currentTarget.value) || 0,
                    }),
                  });
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
                  onSessionChange({
                    kind: "extract-carline",
                    session: updateExtractCarlineCurrentDraft(session, {
                      labelFontSize: clampBusinessCommandLabelFontSize(
                        Number(event.currentTarget.value),
                      ),
                    }),
                  });
                }}
              />
            </div>

            <div className="row">
              <div className="label">编号颜色</div>
              <input
                className="input"
                type="color"
                value={normalizeBusinessCommandLabelColor(
                  currentDraft.labelColor,
                  "#22c55e",
                )}
                onChange={(event) => {
                  onSessionChange({
                    kind: "extract-carline",
                    session: updateExtractCarlineCurrentDraft(session, {
                      labelColor: event.currentTarget.value,
                    }),
                  });
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
                onSessionChange({
                  kind: "extract-carline",
                  session: updateExtractCarlineCurrentDraft(session, {
                    areaName: event.currentTarget.value,
                  }),
                });
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
                          onSessionChange({
                            kind: "extract-carline",
                            session: removeCurrentExtractCarlineLine(
                              session,
                              line.nodeId,
                            ),
                          });
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
                      <span style={{ color: area.labelColor }}>
                        {area.selectedLines.length} 条线 / {area.labelFontSize}px
                      </span>
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
                  onCommit();
                }
                return;
              }
              onSessionChange({
                kind: "extract-carline",
                session: result.session,
              });
              onCommit();
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
              onSessionChange({
                kind: "extract-carline",
                session: result.session,
              });
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

  if (!open || !session) return null;

  return (
    <BusinessCommandDialog
      open={open}
      title="提取车线"
      summary="画布交互已切换到 Fabric 命中与预览，面板负责参数和流程控制。"
      confirmDialog={confirmDialog}
      onRequestClose={() => setConfirmState("exit")}
      bodyContent={bodyContent}
      footerContent={footerContent}
    />
  );
}
