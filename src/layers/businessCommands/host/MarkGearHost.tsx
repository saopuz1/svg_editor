import { useMemo, useState } from "react";
import { BusinessCommandDialog } from "../../../components/BusinessCommandDialog";
import {
  MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE,
  MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE,
  clampBusinessCommandLabelFontSize,
  normalizeBusinessCommandLabelColor,
} from "../businessCommandLabelStyle";
import { getGearColor } from "../markGearPreview";
import {
  canAdvanceToNextGear,
  canFinishMarkGear,
  commitMarkGearCurrentGear,
  getMarkGearUsedNodeIds,
  toggleMarkGearLines,
} from "../markGearSession";
import {
  createBusinessCommandConfirmDialog,
  type BusinessCommandCanvasHostProps,
  type BusinessCommandConfirmState,
} from "./businessCommandHostShared";

// 档位颜色从 markGearPreview 统一导入，预览与最终标注色保持一致

export function MarkGearHost({
  open,
  activeCommand,
  onSessionChange,
  onClose,
  onRestart,
  onCommit,
}: BusinessCommandCanvasHostProps) {
  const session = activeCommand?.kind === "mark-gear" ? activeCommand.session : null;
  const [gearError, setGearError] = useState("");
  const [confirmState, setConfirmState] =
    useState<BusinessCommandConfirmState>(null);

  const confirmDialog = useMemo(
    () =>
      createBusinessCommandConfirmDialog({
        confirmState,
        restartText:
          "重新开始会清空当前流程以及已经写入画布的档位结果，并回到初始状态。",
        onCancel: () => setConfirmState(null),
        onExit: () => {
          setConfirmState(null);
          onClose();
        },
        onRestart: () => {
          setGearError("");
          setConfirmState(null);
          onRestart();
        },
      }),
    [confirmState, onClose, onRestart],
  );

  // ── 派生状态 ────────────────────────────────────────────────────────────────

  const canAdvance = session ? canAdvanceToNextGear(session) : false;
  const canFinish = session ? canFinishMarkGear(session) : false;

  // ── 统计信息 ─────────────────────────────────────────────────────────────────

  const totalCarlines = session?.carlineNodeIds.length ?? 0;
  const markedCarlines = useMemo(() => {
    if (!session) return 0;
    const usedIds = getMarkGearUsedNodeIds(session);
    const currentIds = new Set(session.currentLines.map((l) => l.nodeId));
    return session.carlineNodeIds.filter(
      (id) => usedIds.has(id) || currentIds.has(id),
    ).length;
  }, [session]);

  // ── Panel Body ───────────────────────────────────────────────────────────────

  const bodyContent = useMemo(() => {
    if (!session) return undefined;
    return (
      <div className="extractCarlinePanel">
        {/* 当前档位摘要 */}
        <div className="businessDialogSection extractCarlinePanelSection">
          <div className="extractCarlineSummaryGrid">
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">当前档位</div>
              <div
                className="businessDialogMetaValue"
                style={{ color: getGearColor(session.currentGearNumber) }}
              >
                第 {session.currentGearNumber} 档
              </div>
            </div>
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">本档已选</div>
              <div className="businessDialogMetaValue">
                {session.currentLines.length} 条
              </div>
            </div>
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">总进度</div>
              <div className="businessDialogMetaValue">
                {markedCarlines} / {totalCarlines}
              </div>
            </div>
          </div>

          <div className="row extractCarlineAreaNameRow">
            <div className="label">本档字号</div>
            <input
              className="input"
              type="number"
              min={MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE}
              max={MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE}
              value={session.currentLabelFontSize}
              onChange={(event) => {
                onSessionChange({
                  kind: "mark-gear",
                  session: {
                    ...session,
                    currentLabelFontSize: clampBusinessCommandLabelFontSize(
                      Number(event.currentTarget.value),
                    ),
                  },
                });
              }}
            />
          </div>

          <div className="row extractCarlineAreaNameRow">
            <div className="label">本档颜色</div>
            <input
              className="input"
              type="color"
              value={normalizeBusinessCommandLabelColor(
                session.currentLabelColor,
                  "#7c3aed",
              )}
              onChange={(event) => {
                onSessionChange({
                  kind: "mark-gear",
                  session: {
                    ...session,
                    currentLabelColor: event.currentTarget.value,
                  },
                });
              }}
            />
          </div>

          <div className="businessDialogHint extractCarlineHint">
            只能勾选车线（绿色显示的线条）。点击单选；拖动刷选。所有车线全部标记完成后才能点击「完成」。
          </div>

          {gearError ? (
            <div className="businessDialogError">{gearError}</div>
          ) : null}
        </div>

        {/* 已完成档位列表 */}
        <div className="extractCarlineListsGrid">
          <div className="businessDialogSection extractCarlinePanelSection">
            <div className="businessDialogFieldLabel">本档勾选（可取消）</div>
            <div className="businessDialogSelectionList extractCarlineSelectionList">
              {session.currentLines.length > 0 ? (
                session.currentLines.map((line, index) => (
                  <div
                    key={line.nodeId}
                    className="businessDialogSelectionItem extractCarlineSelectionItem"
                  >
                    <span
                      style={{
                        color: getGearColor(session.currentGearNumber),
                        fontWeight: 700,
                      }}
                    >
                      {index + 1}
                    </span>
                    <div className="businessDialogSelectionContent">
                      <span className="businessDialogSelectionText">
                        {line.nodeId}
                      </span>
                      <button
                        type="button"
                        className="businessDialogSelectionAction"
                        onClick={() => {
                          onSessionChange({
                            kind: "mark-gear",
                            session: toggleMarkGearLines(session, [
                              {
                                nodeId: line.nodeId,
                                hitPoint: { ...line.hitPoint },
                                hitOrder: 0,
                              },
                            ]),
                          });
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted">本档还没有勾选车线。</div>
              )}
            </div>
          </div>

          <div className="businessDialogSection extractCarlinePanelSection">
            <div className="businessDialogFieldLabel">已完成的档位</div>
            <div className="businessDialogSelectionList extractCarlineSelectionList">
              {session.completedGears.length > 0 ? (
                session.completedGears.map((gear) => (
                  <div
                    key={gear.gearNumber}
                    className="businessDialogSelectionItem extractCarlineSelectionItem"
                  >
                    <span
                      style={{
                        color: getGearColor(gear.gearNumber),
                        fontWeight: 700,
                      }}
                    >
                      {gear.gearNumber} 档
                    </span>
                    <span>
                      <span style={{ color: gear.labelColor }}>
                        {gear.selectedLines.length} 条线 / {gear.labelFontSize}px
                      </span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="muted">还没有完成任何档位。</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }, [gearError, markedCarlines, session, totalCarlines]);

  // ── Footer ───────────────────────────────────────────────────────────────────

  const footerContent = useMemo(() => {
    if (!session) return undefined;
    return (
      <div className="businessDialogFooter">
        <div className="businessDialogFooterLeft">
          <span className="muted">
            {canFinish
              ? "所有车线已标记，可以完成。"
              : `还有 ${totalCarlines - markedCarlines} 条车线未标记。`}
          </span>
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
            disabled={!canFinish}
            onClick={() => {
              if (!session) return;
              // 若当前档位还有勾选，先提交当前档位再完成
              let finalSession = session;
              if (session.currentLines.length > 0) {
                const result = commitMarkGearCurrentGear(session);
                if (result.validationError) {
                  setGearError(result.validationError);
                  return;
                }
                finalSession = result.session;
              }
              onSessionChange({
                kind: "mark-gear",
                session: finalSession,
              });
              onCommit();
            }}
          >
            完成
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            disabled={!canAdvance}
            onClick={() => {
              if (!session) return;
              const result = commitMarkGearCurrentGear(session);
              if (result.validationError) {
                setGearError(result.validationError);
                return;
              }
              setGearError("");
              onSessionChange({
                kind: "mark-gear",
                session: result.session,
              });
            }}
          >
            下一档
          </button>
        </div>
      </div>
    );
  }, [
    canAdvance,
    canFinish,
    markedCarlines,
    onCommit,
    onSessionChange,
    session,
    totalCarlines,
  ]);

  // ── 渲染 ─────────────────────────────────────────────────────────────────────

  if (!open || !session) return null;

  return (
    <BusinessCommandDialog
      open={open}
      title="标记档位"
      summary="在 Fabric 画布上逐档勾选，所有车线全部标记完成后才能提交。"
      confirmDialog={confirmDialog}
      onRequestClose={() => setConfirmState("exit")}
      bodyContent={bodyContent}
      footerContent={footerContent}
    />
  );
}
