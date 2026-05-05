import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface BusinessCommandStep {
  title: string;
  description: string;
}

type DialogFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeDirection = 'top' | 'right' | 'bottom' | 'left';

const DIALOG_MARGIN = 12;
const DIALOG_DEFAULT_WIDTH = 460;
const DIALOG_DEFAULT_HEIGHT = 420;
const DIALOG_MIN_WIDTH = 360;
const DIALOG_MIN_HEIGHT = 280;

function clampFrame(frame: DialogFrame): DialogFrame {
  const maxWidth = Math.max(
    DIALOG_MIN_WIDTH,
    window.innerWidth - DIALOG_MARGIN * 2,
  );
  const maxHeight = Math.max(
    DIALOG_MIN_HEIGHT,
    window.innerHeight - DIALOG_MARGIN * 2,
  );
  const width = Math.min(Math.max(DIALOG_MIN_WIDTH, frame.width), maxWidth);
  const height = Math.min(Math.max(DIALOG_MIN_HEIGHT, frame.height), maxHeight);
  return {
    width,
    height,
    x: Math.min(
      Math.max(DIALOG_MARGIN, frame.x),
      Math.max(DIALOG_MARGIN, window.innerWidth - width - DIALOG_MARGIN),
    ),
    y: Math.min(
      Math.max(DIALOG_MARGIN, frame.y),
      Math.max(DIALOG_MARGIN, window.innerHeight - height - DIALOG_MARGIN),
    ),
  };
}

export function BusinessCommandDialog({
  open,
  title,
  summary,
  steps,
  currentStep,
  showExitConfirm,
  onPrev,
  onNext,
  onFinish,
  onRequestClose,
  onCancelExit,
  onConfirmExit,
  bodyContent,
  footerContent,
}: {
  open: boolean;
  title: string;
  summary?: string;
  steps: readonly BusinessCommandStep[];
  currentStep: number;
  showExitConfirm: boolean;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  onRequestClose: () => void;
  onCancelExit: () => void;
  onConfirmExit: () => void;
  bodyContent?: ReactNode;
  footerContent?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<DialogFrame>(() =>
    clampFrame({
      x: Math.max(DIALOG_MARGIN, window.innerWidth - DIALOG_DEFAULT_WIDTH - 16),
      y: 56,
      width: DIALOG_DEFAULT_WIDTH,
      height: DIALOG_DEFAULT_HEIGHT,
    }),
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onRequestClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onRequestClose]);

  useEffect(() => {
    const onResize = () => {
      setFrame((prev) => clampFrame(prev));
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!open) return null;

  const step = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const startDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = frame.x;
    const originY = frame.y;
    const width = dialog.offsetWidth;
    const height = dialog.offsetHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      setFrame(
        clampFrame({
          x: originX + moveEvent.clientX - startX,
          y: originY + moveEvent.clientY - startY,
          width,
          height,
        }),
      );
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const startResize =
    (direction: ResizeDirection) => (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const origin = frame;
      const startX = event.clientX;
      const startY = event.clientY;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        let nextFrame: DialogFrame = { ...origin };

        if (direction === 'right') {
          nextFrame.width = origin.width + deltaX;
        }
        if (direction === 'bottom') {
          nextFrame.height = origin.height + deltaY;
        }
        if (direction === 'left') {
          nextFrame.width = origin.width - deltaX;
          nextFrame.x = origin.x + deltaX;
        }
        if (direction === 'top') {
          nextFrame.height = origin.height - deltaY;
          nextFrame.y = origin.y + deltaY;
        }

        if (direction === 'left' && nextFrame.width < DIALOG_MIN_WIDTH) {
          nextFrame.width = DIALOG_MIN_WIDTH;
          nextFrame.x = origin.x + (origin.width - DIALOG_MIN_WIDTH);
        }
        if (direction === 'top' && nextFrame.height < DIALOG_MIN_HEIGHT) {
          nextFrame.height = DIALOG_MIN_HEIGHT;
          nextFrame.y = origin.y + (origin.height - DIALOG_MIN_HEIGHT);
        }

        const maxWidth = window.innerWidth - DIALOG_MARGIN * 2;
        const maxHeight = window.innerHeight - DIALOG_MARGIN * 2;

        nextFrame.width = Math.min(nextFrame.width, maxWidth);
        nextFrame.height = Math.min(nextFrame.height, maxHeight);

        if (direction === 'right') {
          nextFrame.width = Math.min(
            Math.max(DIALOG_MIN_WIDTH, nextFrame.width),
            window.innerWidth - origin.x - DIALOG_MARGIN,
          );
        }
        if (direction === 'bottom') {
          nextFrame.height = Math.min(
            Math.max(DIALOG_MIN_HEIGHT, nextFrame.height),
            window.innerHeight - origin.y - DIALOG_MARGIN,
          );
        }
        if (direction === 'left') {
          nextFrame.x = Math.max(DIALOG_MARGIN, nextFrame.x);
          nextFrame.width = origin.x + origin.width - nextFrame.x;
          nextFrame.width = Math.max(DIALOG_MIN_WIDTH, nextFrame.width);
          nextFrame.x = origin.x + origin.width - nextFrame.width;
        }
        if (direction === 'top') {
          nextFrame.y = Math.max(DIALOG_MARGIN, nextFrame.y);
          nextFrame.height = origin.y + origin.height - nextFrame.y;
          nextFrame.height = Math.max(DIALOG_MIN_HEIGHT, nextFrame.height);
          nextFrame.y = origin.y + origin.height - nextFrame.height;
        }

        setFrame(clampFrame(nextFrame));
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

  return (
    <div className="businessDialogOverlay">
      <div
        ref={dialogRef}
        className="businessDialog"
        role="dialog"
        aria-modal="false"
        aria-label={title}
        style={{
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
        }}
      >
        <div
          className="businessDialogResizeHandle businessDialogResizeHandleTop"
          onMouseDown={startResize('top')}
        />
        <div
          className="businessDialogResizeHandle businessDialogResizeHandleRight"
          onMouseDown={startResize('right')}
        />
        <div
          className="businessDialogResizeHandle businessDialogResizeHandleBottom"
          onMouseDown={startResize('bottom')}
        />
        <div
          className="businessDialogResizeHandle businessDialogResizeHandleLeft"
          onMouseDown={startResize('left')}
        />
        <div
          className="businessDialogHeader businessDialogDragHandle"
          onMouseDown={startDrag}
        >
          <div>
            <div className="businessDialogTitle">{title}</div>
            {summary ? <div className="businessDialogSummary">{summary}</div> : null}
          </div>
          <button
            type="button"
            className="businessDialogClose"
            aria-label="退出流程"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onRequestClose}
          >
            ×
          </button>
        </div>

        <div className="businessDialogSteps" aria-label="流程步骤">
          {steps.map((item, index) => {
            const state =
              index < currentStep ? 'done' : index === currentStep ? 'active' : 'idle';
            return (
              <div
                key={`${title}-${item.title}`}
                className={`businessDialogStep businessDialogStep${state[0].toUpperCase()}${state.slice(1)}`}
              >
                <div className="businessDialogStepIndex">{index + 1}</div>
                <div className="businessDialogStepText">{item.title}</div>
              </div>
            );
          })}
        </div>

        <div className="businessDialogBody">
          {bodyContent ?? (
            <>
              <div className="businessDialogBodyLabel">
                第 {currentStep + 1} 步 / 共 {steps.length} 步
              </div>
              <div className="businessDialogBodyTitle">{step.title}</div>
              <div className="businessDialogBodyDescription">{step.description}</div>
              <div className="businessDialogHint">
                保持当前窗口打开，按本步骤说明继续在 SVG 画布中选择、标记或调整对象。
              </div>
            </>
          )}
        </div>

        {footerContent ?? (
          <div className="businessDialogFooter">
            <div className="businessDialogFooterLeft">
              <button
                type="button"
                className="btn"
                onClick={onPrev}
                disabled={isFirstStep}
              >
                上一步
              </button>
            </div>

            <div className="businessDialogFooterRight">
              <button type="button" className="btn" onClick={onRequestClose}>
                退出
              </button>
              {isLastStep ? (
                <button type="button" className="btn btnPrimary" onClick={onFinish}>
                  完成
                </button>
              ) : (
                <button type="button" className="btn btnPrimary" onClick={onNext}>
                  下一步
                </button>
              )}
            </div>
          </div>
        )}

        {showExitConfirm ? (
          <div className="businessDialogConfirmOverlay">
            <div className="businessDialogConfirm">
              <div className="businessDialogConfirmTitle">是否结束，将清理当前操作</div>
              <div className="businessDialogConfirmText">
                当前业务命令流程尚未完成，结束后会清空当前步骤状态。
              </div>
              <div className="businessDialogConfirmActions">
                <button type="button" className="btn" onClick={onCancelExit}>
                  继续操作
                </button>
                <button
                  type="button"
                  className="btn btnDanger"
                  onClick={onConfirmExit}
                >
                  结束并清理
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
