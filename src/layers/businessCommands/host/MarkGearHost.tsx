import { useEffect, useMemo, useState } from "react";
import { BusinessCommandDialog } from "../../../components/BusinessCommandDialog";
import type { MarkGearSession } from "../businessCommandTypes";
import {
  MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE,
  MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE,
  clampBusinessCommandLabelFontSize,
} from "../businessCommandLabelStyle";
import { resetDocumentForMarkGear } from "../businessCommandReset";
import { applyMarkGearSession, getGearColor } from "../markGearPreview";
import {
  canAdvanceToNextGear,
  canFinishMarkGear,
  commitMarkGearCurrentGear,
  createMarkGearSession,
  getMarkGearHittableNodeIds,
  getMarkGearUsedNodeIds,
  toggleMarkGearLines,
  updateMarkGearLabelPosition,
} from "../markGearSession";
import {
  BusinessCommandSvgSurface,
  type LineHighlightInfo,
  type SurfaceLabelItem,
  type SvgPoint,
} from "../surfaces/BusinessCommandSvgSurface";
import {
  createBusinessCommandConfirmDialog,
  type BusinessCommandCanvasHostProps,
  type BusinessCommandConfirmState,
} from "./businessCommandHostShared";

// 档位颜色从 markGearPreview 统一导入，预览与最终标注色保持一致

export function MarkGearHost({
  open,
  document,
  svgMarkup,
  viewportTransform,
  onDocumentChange,
  onClose,
  onCommit,
}: BusinessCommandCanvasHostProps) {
  const [session, setSession] = useState<MarkGearSession | null>(null);
  const [gearError, setGearError] = useState("");
  const [confirmState, setConfirmState] =
    useState<BusinessCommandConfirmState>(null);

  // 开启时初始化 session
  useEffect(() => {
    if (!open) {
      setSession(null);
      setGearError("");
      setConfirmState(null);
      return;
    }
    setSession(createMarkGearSession(document));
    setGearError("");
    setConfirmState(null);
    // 只在 open 变化时重建 session，不依赖 document 变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
          const nextDocument = resetDocumentForMarkGear(document);
          onDocumentChange(nextDocument);
          setSession(createMarkGearSession(nextDocument));
          setGearError("");
          setConfirmState(null);
        },
      }),
    [confirmState, document, onClose, onDocumentChange],
  );

  // ── 派生状态 ────────────────────────────────────────────────────────────────

  const canAdvance = session ? canAdvanceToNextGear(session) : false;
  const canFinish = session ? canFinishMarkGear(session) : false;

  // 允许命中的节点 ID 集合（只有当前档位可勾选的节点）
  const candidateNodeIds = useMemo<ReadonlySet<string>>(
    () => (session ? getMarkGearHittableNodeIds(session) : new Set<string>()),
    [session],
  );

  // 高亮颜色映射：已完成档位 isUsed=true，当前档位已选 isUsed=false
  const lineHighlightMap = useMemo<
    ReadonlyMap<string, LineHighlightInfo>
  >(() => {
    if (!session) return new Map();
    const map = new Map<string, LineHighlightInfo>();
    // 已完成档位（锁定）
    for (const gear of session.completedGears) {
      const color = getGearColor(gear.gearNumber);
      for (const line of gear.selectedLines) {
        map.set(line.nodeId, { color, isUsed: true });
      }
    }
    // 当前档位已选（可取消）
    const currentColor = getGearColor(session.currentGearNumber);
    for (const line of session.currentLines) {
      map.set(line.nodeId, { color: currentColor, isUsed: false });
    }
    return map;
  }, [session]);

  // 预览标签（在交点处显示档位编号）
  const previewLabels = useMemo<SurfaceLabelItem[]>(() => {
    if (!session) return [];
    const labels: SurfaceLabelItem[] = [];
    // 已完成档位
    for (const gear of session.completedGears) {
      const color = getGearColor(gear.gearNumber);
      for (const line of gear.selectedLines) {
        labels.push({
          key: `gear${gear.gearNumber}-${line.nodeId}`,
          nodeId: line.nodeId,
          text: String(gear.gearNumber),
          x: line.hitPoint.x,
          y: line.hitPoint.y,
          color,
          fontSize: gear.labelFontSize,
        });
      }
    }
    // 当前档位
    const currentColor = getGearColor(session.currentGearNumber);
    for (const line of session.currentLines) {
      labels.push({
        key: `gear${session.currentGearNumber}-${line.nodeId}`,
        nodeId: line.nodeId,
        text: String(session.currentGearNumber),
        x: line.hitPoint.x,
        y: line.hitPoint.y,
        color: currentColor,
        fontSize: session.currentLabelFontSize,
      });
    }
    return labels;
  }, [session]);

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
                setSession((prev) =>
                  prev
                    ? {
                        ...prev,
                        currentLabelFontSize: clampBusinessCommandLabelFontSize(
                          Number(event.currentTarget.value),
                        ),
                      }
                    : prev,
                );
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
                    <span>{line.nodeId}</span>
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
                      {gear.selectedLines.length} 条线 / {gear.labelFontSize}px
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
              onCommit(applyMarkGearSession(document, finalSession));
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
              setSession(result.session);
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
    document,
    markedCarlines,
    onCommit,
    session,
    totalCarlines,
  ]);

  // ── 渲染 ─────────────────────────────────────────────────────────────────────

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
            prev ? updateMarkGearLabelPosition(prev, nodeId, markerPos) : prev,
          );
        }}
        onToggleLine={(nodeId: string, markerPos: SvgPoint) => {
          setSession((prev) =>
            prev
              ? toggleMarkGearLines(prev, [
                  {
                    nodeId,
                    hitPoint: markerPos,
                    hitOrder: prev.currentLines.length,
                  },
                ])
              : prev,
          );
          setGearError("");
        }}
      />
      <BusinessCommandDialog
        open={open}
        title="标记档位"
        summary="在车线上逐档勾选，所有车线全部标记完成后才能提交。"
        confirmDialog={confirmDialog}
        onRequestClose={() => setConfirmState("exit")}
        bodyContent={bodyContent}
        footerContent={footerContent}
      />
    </>
  );
}
