import { useMemo, useState } from "react";
import { BusinessCommandDialog } from "../../../components/BusinessCommandDialog";
import {
  MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE,
  MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE,
  clampBusinessCommandLabelFontSize,
} from "../businessCommandLabelStyle";
import {
  createBusinessCommandConfirmDialog,
  type BusinessCommandCanvasHostProps,
  type BusinessCommandConfirmState,
} from "./businessCommandHostShared";

const DOUBLE_COLOR = "#2563eb";

export function MarkOddEvenHost({
  open,
  activeCommand,
  onSessionChange,
  onClose,
  onRestart,
  onCommit,
}: BusinessCommandCanvasHostProps) {
  const session =
    activeCommand?.kind === "mark-odd-even" ? activeCommand.session : null;
  const [confirmState, setConfirmState] =
    useState<BusinessCommandConfirmState>(null);

  const confirmDialog = useMemo(
    () =>
      createBusinessCommandConfirmDialog({
        confirmState,
        restartText:
          "重新开始会清空当前流程以及已经写入画布的单双结果，并回到初始状态。",
        onCancel: () => setConfirmState(null),
        onExit: () => {
          setConfirmState(null);
          onClose();
        },
        onRestart: () => {
          setConfirmState(null);
          onRestart();
        },
      }),
    [confirmState, onClose, onRestart],
  );

  // ── 统计 ────────────────────────────────────────────────────────────────────

  const totalCarlines = session?.carlineNodeIds.length ?? 0;
  const doubleCount = session?.doubleLines.length ?? 0;
  const singleCount = totalCarlines - doubleCount;

  // ── 面板内容 ─────────────────────────────────────────────────────────────────

  const bodyContent = useMemo(() => {
    if (!session) return undefined;
    return (
      <div className="extractCarlinePanel">
        <div className="businessDialogSection extractCarlinePanelSection">
          <div className="extractCarlineSummaryGrid">
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">总车线</div>
              <div className="businessDialogMetaValue">{totalCarlines} 条</div>
            </div>
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">已标记双</div>
              <div
                className="businessDialogMetaValue"
                style={{ color: DOUBLE_COLOR }}
              >
                {doubleCount} 条
              </div>
            </div>
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">单（未标记）</div>
              <div className="businessDialogMetaValue">{singleCount} 条</div>
            </div>
          </div>

          <div className="businessDialogHint extractCarlineHint">
            点击或拖动刷选车线，勾选为「双」（蓝色）；再次点击取消。未勾选线条默认为「单」（灰色）。
          </div>

          <div className="row extractCarlineAreaNameRow">
            <div className="label">单双字号</div>
            <input
              className="input"
              type="number"
              min={MIN_BUSINESS_COMMAND_LABEL_FONT_SIZE}
              max={MAX_BUSINESS_COMMAND_LABEL_FONT_SIZE}
              value={session.labelFontSize}
              onChange={(event) => {
                onSessionChange({
                  kind: "mark-odd-even",
                  session: {
                    ...session,
                    labelFontSize: clampBusinessCommandLabelFontSize(
                      Number(event.currentTarget.value),
                    ),
                  },
                });
              }}
            />
          </div>
        </div>

        <div className="businessDialogSection extractCarlinePanelSection">
          <div className="businessDialogFieldLabel">已标记为双的线条</div>
          <div className="businessDialogSelectionList extractCarlineSelectionList">
            {session.doubleLines.length > 0 ? (
              session.doubleLines.map((line, index) => (
                <div
                  key={line.nodeId}
                  className="businessDialogSelectionItem extractCarlineSelectionItem"
                >
                  <span>{index + 1}</span>
                  <span>{line.nodeId}</span>
                </div>
              ))
            ) : (
              <div className="muted">还没有勾选线条。</div>
            )}
          </div>
        </div>
      </div>
    );
  }, [session, doubleCount, singleCount, totalCarlines]);

  const footerContent = useMemo(() => {
    if (!session) return undefined;
    return (
      <div className="businessDialogFooter">
        <div className="businessDialogFooterLeft" />
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
            className="btn btnPrimary"
            onClick={onCommit}
          >
            完成
          </button>
        </div>
      </div>
    );
  }, [onCommit, session]);

  if (!open || !session) return null;

  return (
    <BusinessCommandDialog
      open={open}
      title="标记单双"
      summary="在 Fabric 画布上勾选车线标记为双，未勾选默认为单。"
      confirmDialog={confirmDialog}
      onRequestClose={() => setConfirmState("exit")}
      bodyContent={bodyContent}
      footerContent={footerContent}
    />
  );
}
