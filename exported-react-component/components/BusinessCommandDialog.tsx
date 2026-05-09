import { useEffect, useRef, useState, type ReactNode } from "react";

export interface BusinessCommandConfirmDialog {
  title: string;
  text: string;
  cancelLabel?: string;
  confirmLabel: string;
  confirmButtonClassName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

interface BusinessCommandDialogProps {
  open: boolean;
  title: string;
  summary?: string;
  confirmDialog?: BusinessCommandConfirmDialog | null;
  onRequestClose: () => void;
  bodyContent: ReactNode;
  footerContent: ReactNode;
}

type DialogFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeDirection = "top" | "right" | "bottom" | "left";

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
  confirmDialog,
  onRequestClose,
  bodyContent,
  footerContent,
}: BusinessCommandDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<DialogFrame>(() =>
    clampFrame({
      x: Math.max(DIALOG_MARGIN, window.innerWidth - DIALOG_DEFAULT_WIDTH - 16),
      y: 56,
      width: DIALOG_DEFAULT_WIDTH,
      height: DIALOG_DEFAULT_HEIGHT,
    }),
  );

  const activeConfirmDialog = confirmDialog ?? null;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (activeConfirmDialog) {
          activeConfirmDialog.onCancel();
          return;
        }
        onRequestClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeConfirmDialog, open, onRequestClose]);

  useEffect(() => {
    const onResize = () => {
      setFrame((prev) => clampFrame(prev));
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!open) return null;

  const startDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;

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
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startResize =
    (direction: ResizeDirection) =>
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const origin = frame;
      const startX = event.clientX;
      const startY = event.clientY;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        let nextFrame: DialogFrame = { ...origin };

        if (direction === "right") {
          nextFrame.width = origin.width + deltaX;
        }
        if (direction === "bottom") {
          nextFrame.height = origin.height + deltaY;
        }
        if (direction === "left") {
          nextFrame.width = origin.width - deltaX;
          nextFrame.x = origin.x + deltaX;
        }
        if (direction === "top") {
          nextFrame.height = origin.height - deltaY;
          nextFrame.y = origin.y + deltaY;
        }

        if (direction === "left" && nextFrame.width < DIALOG_MIN_WIDTH) {
          nextFrame.width = DIALOG_MIN_WIDTH;
          nextFrame.x = origin.x + (origin.width - DIALOG_MIN_WIDTH);
        }
        if (direction === "top" && nextFrame.height < DIALOG_MIN_HEIGHT) {
          nextFrame.height = DIALOG_MIN_HEIGHT;
          nextFrame.y = origin.y + (origin.height - DIALOG_MIN_HEIGHT);
        }

        const maxWidth = window.innerWidth - DIALOG_MARGIN * 2;
        const maxHeight = window.innerHeight - DIALOG_MARGIN * 2;

        nextFrame.width = Math.min(nextFrame.width, maxWidth);
        nextFrame.height = Math.min(nextFrame.height, maxHeight);

        if (direction === "right") {
          nextFrame.width = Math.min(
            Math.max(DIALOG_MIN_WIDTH, nextFrame.width),
            window.innerWidth - origin.x - DIALOG_MARGIN,
          );
        }
        if (direction === "bottom") {
          nextFrame.height = Math.min(
            Math.max(DIALOG_MIN_HEIGHT, nextFrame.height),
            window.innerHeight - origin.y - DIALOG_MARGIN,
          );
        }
        if (direction === "left") {
          nextFrame.x = Math.max(DIALOG_MARGIN, nextFrame.x);
          nextFrame.width = origin.x + origin.width - nextFrame.x;
          nextFrame.width = Math.max(DIALOG_MIN_WIDTH, nextFrame.width);
          nextFrame.x = origin.x + origin.width - nextFrame.width;
        }
        if (direction === "top") {
          nextFrame.y = Math.max(DIALOG_MARGIN, nextFrame.y);
          nextFrame.height = origin.y + origin.height - nextFrame.y;
          nextFrame.height = Math.max(DIALOG_MIN_HEIGHT, nextFrame.height);
          nextFrame.y = origin.y + origin.height - nextFrame.height;
        }

        setFrame(clampFrame(nextFrame));
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
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
          onMouseDown={startResize("top")}
        />
        <div
          className="businessDialogResizeHandle businessDialogResizeHandleRight"
          onMouseDown={startResize("right")}
        />
        <div
          className="businessDialogResizeHandle businessDialogResizeHandleBottom"
          onMouseDown={startResize("bottom")}
        />
        <div
          className="businessDialogResizeHandle businessDialogResizeHandleLeft"
          onMouseDown={startResize("left")}
        />
        <div
          className="businessDialogHeader businessDialogDragHandle"
          onMouseDown={startDrag}
        >
          <div>
            <div className="businessDialogTitle">{title}</div>
            {summary ? (
              <div className="businessDialogSummary">{summary}</div>
            ) : null}
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
        <div className="businessDialogBody">{bodyContent}</div>

        {footerContent}

        {activeConfirmDialog ? (
          <div className="businessDialogConfirmOverlay">
            <div className="businessDialogConfirm">
              <div className="businessDialogConfirmTitle">
                {activeConfirmDialog.title}
              </div>
              <div className="businessDialogConfirmText">
                {activeConfirmDialog.text}
              </div>
              <div className="businessDialogConfirmActions">
                <button
                  type="button"
                  className="btn"
                  onClick={activeConfirmDialog.onCancel}
                >
                  {activeConfirmDialog.cancelLabel ?? "取消"}
                </button>
                <button
                  type="button"
                  className={
                    activeConfirmDialog.confirmButtonClassName ??
                    "btn btnDanger"
                  }
                  onClick={activeConfirmDialog.onConfirm}
                >
                  {activeConfirmDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
