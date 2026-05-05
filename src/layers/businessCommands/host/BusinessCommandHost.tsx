import { useEffect, useMemo, useState } from 'react';
import { BusinessCommandDialog } from '../../../components/BusinessCommandDialog';
import type { DocumentState } from '../../data/types';
import {
  EXTRACT_CARLINE_AREA_PRESETS,
  type ExtractCarlineSession,
} from '../businessCommandTypes';
import { applyExtractCarlineSession } from '../extractCarlinePreview';
import {
  commitExtractCarlineCurrentArea,
  createExtractCarlineSession,
  toggleCurrentExtractCarlineLines,
  updateExtractCarlineCurrentDraft,
  validateExtractCarlineAreaName,
} from '../extractCarlineSession';
import { BusinessCommandSvgSurface } from '../surfaces/BusinessCommandSvgSurface';

const EXTRACT_CARLINE_STEPS = [
  {
    title: '当前区域',
    description: '选择区域、设置车线长度，并直接在画布上刷选当前区域的线条。',
  },
] as const;

export function BusinessCommandHost({
  open,
  kind,
  document,
  svgMarkup,
  onClose,
  onCommit,
}: {
  open: boolean;
  kind: 'extract-carline' | null;
  document: DocumentState;
  svgMarkup: string;
  onClose: () => void;
  onCommit: (next: DocumentState) => void;
}) {
  const [session, setSession] = useState<ExtractCarlineSession | null>(null);
  const [validationError, setValidationError] = useState('');
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    if (!open || kind !== 'extract-carline') {
      setSession(null);
      setValidationError('');
      setShowExitConfirm(false);
      return;
    }
    setSession(createExtractCarlineSession());
    setValidationError('');
    setShowExitConfirm(false);
  }, [kind, open]);

  const currentDraft = session?.currentDraft ?? null;
  const liveValidationError =
    session && currentDraft
      ? validateExtractCarlineAreaName(session, currentDraft.areaName, {
          presetId: currentDraft.presetId,
        })
      : null;
  const currentValidationError = validationError || liveValidationError || '';
  const hasAnyArea =
    (session?.completedAreas.length ?? 0) > 0 ||
    (currentDraft?.selectedLines.length ?? 0) > 0;
  const canCommitNextArea =
    (currentDraft?.selectedLines.length ?? 0) > 0 && !currentValidationError;

  const selectPreset = (presetId: ExtractCarlineSession['currentDraft']['presetId']) => {
    if (!session) return;
    const preset = EXTRACT_CARLINE_AREA_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setSession(
      updateExtractCarlineCurrentDraft(session, {
        presetId,
        areaName:
          presetId === '自定义'
            ? session.currentDraft.presetId === '自定义'
              ? session.currentDraft.areaName
              : ''
            : preset.areaName,
        carlineLength:
          presetId === '自定义'
            ? session.currentDraft.presetId === '自定义'
              ? session.currentDraft.carlineLength
              : preset.carlineLength
            : preset.carlineLength,
      }),
    );
    setValidationError('');
  };

  const bodyContent = useMemo(() => {
    if (!session || !currentDraft) return undefined;
    return (
      <div className="extractCarlinePanel">
        <div className="extractCarlinePanelHeader">
          <div>
            <div className="businessDialogBodyLabel">
              第 1 步 / 共 {EXTRACT_CARLINE_STEPS.length} 步
            </div>
            <div className="extractCarlinePanelTitle">{EXTRACT_CARLINE_STEPS[0].title}</div>
          </div>
          <div className="extractCarlinePanelSubtitle">选择区域后直接在画布上勾选线条</div>
        </div>

        <div className="businessDialogSection extractCarlinePanelSection">
          <div className="extractCarlineFormGrid">
            <div className="row">
              <div className="label">区域选项</div>
              <select
                className="input"
                value={currentDraft.presetId}
                onChange={(event) =>
                  selectPreset(
                    event.currentTarget.value as ExtractCarlineSession['currentDraft']['presetId'],
                  )
                }
              >
                {EXTRACT_CARLINE_AREA_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.id === '自定义'
                      ? '自定义区域'
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
          </div>

          <div className="row extractCarlineAreaNameRow">
            <div className="label">区域名称</div>
            <input
              className="input"
              value={currentDraft.areaName}
              disabled={currentDraft.presetId !== '自定义'}
              onChange={(event) => {
                setSession(
                  updateExtractCarlineCurrentDraft(session, {
                    areaName: event.currentTarget.value,
                  }),
                );
                setValidationError('');
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
              <div className="businessDialogMetaValue">{currentDraft.areaName || '-'}</div>
            </div>
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">车线长度</div>
              <div className="businessDialogMetaValue">{currentDraft.carlineLength}</div>
            </div>
            <div className="extractCarlineSummaryCard">
              <div className="businessDialogMetaLabel">当前已选</div>
              <div className="businessDialogMetaValue">{currentDraft.selectedLines.length}</div>
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
                  <div key={line.nodeId} className="businessDialogSelectionItem extractCarlineSelectionItem">
                    <span>{index + 1}</span>
                    <span>{line.nodeId}</span>
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
                    <span>{area.selectedLines.length} 条线</span>
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
  }, [
    currentDraft,
    currentValidationError,
    session,
  ]);

  const footerContent = useMemo(() => {
    if (!session) return undefined;
    return (
      <div className="businessDialogFooter">
        <div className="businessDialogFooterLeft">
          <span className="muted">当前区域与刷线为同一步。</span>
        </div>
        <div className="businessDialogFooterRight">
          <button type="button" className="btn" onClick={() => setShowExitConfirm(true)}>
            退出
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const hasCurrentSelection = session.currentDraft.selectedLines.length > 0;
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
              setValidationError(result.validationError ?? '');
            }}
            disabled={!canCommitNextArea}
          >
            下一个区域
          </button>
        </div>
      </div>
    );
  }, [canCommitNextArea, document, hasAnyArea, onCommit, session]);

  if (!open || kind !== 'extract-carline' || !session) return null;

  return (
    <>
      <BusinessCommandSvgSurface
        document={document}
        svgMarkup={svgMarkup}
        session={session}
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
        steps={EXTRACT_CARLINE_STEPS}
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
