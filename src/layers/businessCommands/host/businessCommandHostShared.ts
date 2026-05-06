import type { BusinessCommandConfirmDialog } from "../../../components/BusinessCommandDialog";
import type { DocumentState } from "../../data/types";
import type { SurfaceViewportTransform } from "../surfaces/BusinessCommandSvgSurface";

export type BusinessCommandId =
  | "extract-carline"
  | "mark-gear"
  | "mark-odd-even";

export interface BusinessCommandCanvasHostProps {
  open: boolean;
  document: DocumentState;
  svgMarkup: string;
  viewportTransform: SurfaceViewportTransform;
  onDocumentChange: (next: DocumentState) => void;
  onClose: () => void;
  onCommit: (next: DocumentState) => void;
}

export type BusinessCommandConfirmState = "exit" | "restart" | null;

interface CreateBusinessCommandConfirmDialogOptions {
  confirmState: BusinessCommandConfirmState;
  restartText: string;
  onCancel: () => void;
  onExit: () => void;
  onRestart: () => void;
}

export function createBusinessCommandConfirmDialog({
  confirmState,
  restartText,
  onCancel,
  onExit,
  onRestart,
}: CreateBusinessCommandConfirmDialogOptions): BusinessCommandConfirmDialog | null {
  if (confirmState === "restart") {
    return {
      title: "是否重新开始",
      text: restartText,
      cancelLabel: "取消",
      confirmLabel: "重新开始",
      confirmButtonClassName: "btn btnDanger",
      onCancel,
      onConfirm: onRestart,
    };
  }

  if (confirmState === "exit") {
    return {
      title: "是否结束，将清理当前操作",
      text: "当前业务命令流程尚未完成，结束后会清空当前步骤状态。",
      cancelLabel: "继续操作",
      confirmLabel: "结束并清理",
      confirmButtonClassName: "btn btnDanger",
      onCancel,
      onConfirm: onExit,
    };
  }

  return null;
}
