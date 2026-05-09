import type { BusinessCommandConfirmDialog } from "../../../components/BusinessCommandDialog";
import type { DocumentState } from "../../data/types";
import type { ActiveBusinessCommandState } from "../../edit/businessCommandsState";
export type { BusinessCommandId } from "../../edit/businessCommandsState";

export interface BusinessCommandCanvasHostProps {
  open: boolean;
  document: DocumentState;
  activeCommand: ActiveBusinessCommandState | null;
  onSessionChange: (next: ActiveBusinessCommandState | null) => void;
  onClose: () => void;
  onRestart: () => void;
  onCommit: () => void;
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
