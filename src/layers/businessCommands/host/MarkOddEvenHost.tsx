import { useEffect, useMemo, useState } from "react";
import { BusinessCommandDialog } from "../../../components/BusinessCommandDialog";
import type { DocumentState } from "../../data/types";
import type { MarkOddEvenSession } from "../businessCommandTypes";
import {
  applyMarkOddEvenSession,
  createMarkOddEvenSession,
  getMarkOddEvenDoubleNodeIds,
  toggleMarkOddEvenLines,
} from "../markOddEvenSession";
import {
  BusinessCommandSvgSurface,
  type LineHighlightInfo,
  type SurfaceLabelItem,
  type SvgPoint,
} from "../surfaces/BusinessCommandSvgSurface";

const DOUBLE_COLOR = "#2563eb";
const SINGLE_COLOR = "#6b7280";

const MARK_ODD_EVEN_STEPS = [
  {
    title: "标记单双",
    description:
      "在车线上点击或刷选，勾选为「双」；再次点击取消。未勾选的车线默认为「单」。",
  },
] as const;

export function MarkOddEvenHost({
  open,
  document,
  svgMarkup,
  onClose,
  onCommit,
}: {
  open: boolean;
  document: DocumentState;
  svgMarkup: string;
  onClose: () => void;
  onCommit: (next: DocumentState) => void;
}) {
  const [session, setSession] = useState<MarkOddEvenSession | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    if (!open) {
      setSession(null);
      setShowExitConfirm(false);
      return;
    }
    setSession(createMarkOddEvenSession(document));
    setShowExitConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── 候选节点（仅车线） ───────────────────────────────────────────────────────

  const candidateNodeIds = useMemo<ReadonlySet<string>>(() => {
    if (!session) return new Set();
    return new Set(session.carlineNodeIds);
  }, [session]);

  // ── 高亮图 ──────────────────────────────────────────────────────────────────

  const lineHighlightMap = useMemo<ReadonlyMap<string, LineHighlightInfo>>(() => {
    if (!session) return new Map();
    const doubleIds = getMarkOddEvenDoubleNodeIds(session);
    const map = new Map<string, LineHighlightInfo>();
    for (const id of session.carlineNodeIds) {
      const isDouble = doubleIds.has(id);
      map.set(id, { color: isDouble ? DOUBLE_COLOR : SINGLE_COLOR, isUsed: false });
    }
    return map;
  }, [session]);

  // ── 预览标签（已勾选为双的线条显示"双"） ────────────────────────────────────

  const previewLabels = useMemo<SurfaceLabelItem[]>(() => {
    if (!session) return [];
    return session.doubleLines.map((line) => ({
      key: `odd-even-${line.nodeId}`,
      text: "双",
      x: line.hitPoint.x,
      y: line.hitPoint.y,
      color: DOUBLE_COLOR,
    }));
  }, [session]);

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
            onClick={() => setShowExitConfirm(true)}
          >
            退出
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={() => onCommit(applyMarkOddEvenSession(document, session))}
          >
            完成
          </button>
        </div>
      </div>
    );
  }, [document, onCommit, session]);

  if (!open || !session) return null;

  return (
    <>
      <BusinessCommandSvgSurface
        document={document}
        svgMarkup={svgMarkup}
        candidateNodeIds={candidateNodeIds}
        lineHighlightMap={lineHighlightMap}
        previewLabels={previewLabels}
        onToggleLine={(nodeId: string, markerPos: SvgPoint) => {
          setSession((prev) =>
            prev
              ? toggleMarkOddEvenLines(prev, [
                  { nodeId, hitPoint: markerPos, hitOrder: 0 },
                ])
              : prev,
          );
        }}
      />
      <BusinessCommandDialog
        open={open}
        title="标记单双"
        summary="勾选车线标记为双，未勾选默认为单。"
        steps={MARK_ODD_EVEN_STEPS}
        currentStep={0}
        showExitConfirm={showExitConfirm}
        onPrev={() => {}}
        onNext={() => {}}
        onFinish={() => {}}
        onRequestClose={() => setShowExitConfirm(true)}
        onCancelExit={() => setShowExitConfirm(false)}
        onConfirmExit={() => {
          setShowExitConfirm(false);
          onClose();
        }}
        bodyContent={bodyContent}
        footerContent={footerContent}
      />
    </>
  );
}
