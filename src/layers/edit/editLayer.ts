import type { DataLayer } from "../data/store";
import type { DocumentState, NodeId } from "../data/types";
import type { EditorCommand, TransientAction } from "./commands";
import {
  applyBusinessCommandState,
  createBusinessCommandState,
  resetDocumentForBusinessCommand,
  type ActiveBusinessCommandState,
  type BusinessCommandId,
} from "./businessCommandsState";
import { createCommand } from "./commands";
import { CommandRegistry } from "./commandRegistry";
import { HistoryManager, type HistoryEntry } from "./history";
import {
  DEFAULT_ACTIVE_TOOL_ID,
  DEFAULT_TOOLS,
  type EditorTool,
  type ToolId,
  getTool,
} from "./tools";

export interface EditState {
  activeToolId: ToolId;
  tools: EditorTool[];
  selection: NodeId[];
  availableCommands: Array<EditorCommand["type"]>;
  businessCommand: ActiveBusinessCommandState | null;
}

export class EditLayer {
  private data: DataLayer;
  private commandRegistry: CommandRegistry;
  private historyManager: HistoryManager;

  private editState: EditState;
  private listeners = new Set<() => void>();

  constructor(
    data: DataLayer,
    commandRegistry: CommandRegistry,
    historyManager: HistoryManager,
  ) {
    this.data = data;
    this.commandRegistry = commandRegistry;
    this.historyManager = historyManager;
    this.editState = {
      activeToolId: DEFAULT_ACTIVE_TOOL_ID,
      tools: DEFAULT_TOOLS,
      selection: [],
      availableCommands: this.commandRegistry.getTypes(),
      businessCommand: null,
    };
  }

  getHistory() {
    return this.historyManager.getState();
  }

  getState = () => this.editState;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  activateTool(toolId: ToolId) {
    const tool = getTool(this.editState.tools, toolId);
    this.editState = { ...this.editState, activeToolId: tool.id };
    this.emit();
  }

  getActiveTool(): EditorTool {
    return getTool(this.editState.tools, this.editState.activeToolId);
  }

  openBusinessCommand(kind: BusinessCommandId) {
    this.editState = {
      ...this.editState,
      selection: [],
      businessCommand: createBusinessCommandState(kind, this.data.getState()),
    };
    this.emit();
  }

  closeBusinessCommand() {
    if (!this.editState.businessCommand) return;
    this.editState = { ...this.editState, businessCommand: null };
    this.emit();
  }

  replaceBusinessCommand(next: ActiveBusinessCommandState | null) {
    this.editState = {
      ...this.editState,
      businessCommand: next,
    };
    this.emit();
  }

  updateBusinessCommand(
    updater: (
      current: ActiveBusinessCommandState,
    ) => ActiveBusinessCommandState | null,
  ) {
    const current = this.editState.businessCommand;
    if (!current) return;
    this.editState = {
      ...this.editState,
      businessCommand: updater(current),
    };
    this.emit();
  }

  restartBusinessCommand() {
    const current = this.editState.businessCommand;
    if (!current) return;
    const nextDocument = resetDocumentForBusinessCommand(
      this.data.getState(),
      current.kind,
    );
    this.execute(
      createCommand("加载文档", { document: nextDocument }, "system"),
      "重新开始业务命令",
    );
    this.editState = {
      ...this.editState,
      businessCommand: createBusinessCommandState(current.kind, nextDocument),
      selection: [],
    };
    this.emit();
  }

  commitBusinessCommand() {
    const current = this.editState.businessCommand;
    if (!current) return;
    const nextDocument = applyBusinessCommandState(
      this.data.getState(),
      current,
    );
    this.editState = {
      ...this.editState,
      businessCommand: null,
      selection: [],
    };
    this.execute(
      createCommand("加载文档", { document: nextDocument }, "system"),
      this.resolveBusinessCommandCommitLabel(current.kind),
    );
  }

  execute(command: EditorCommand, label?: string) {
    const before = structuredClone(this.data.getState());
    const after = this.applyCommand(command, before);
    const nextSelection = this.getNextSelection(command, after);
    this.data.setState(after);

    const entry: HistoryEntry = {
      label: label ?? command.type,
      command,
      before,
      after,
    };

    this.historyManager.record(entry);
    this.editState = {
      ...this.editState,
      selection: nextSelection,
    };

    this.emit();
  }

  act(action: TransientAction) {
    if (action.type === "SET_SELECTION") {
      this.editState = {
        ...this.editState,
        selection: this.filterExistingSelection(
          action.payload.nodeIds,
          this.data.getState(),
        ),
      };
      this.emit();
    }
  }

  undo() {
    const last = this.historyManager.undo();
    if (!last) return;

    this.data.setState(last.before);
    this.editState = {
      ...this.editState,
      selection: this.filterExistingSelection(
        this.editState.selection,
        last.before,
      ),
    };
    this.emit();
  }

  redo() {
    const next = this.historyManager.redo();
    if (!next) return;

    this.data.setState(next.after);
    this.editState = {
      ...this.editState,
      selection: this.filterExistingSelection(
        this.editState.selection,
        next.after,
      ),
    };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private filterExistingSelection(selection: NodeId[], state: DocumentState) {
    return selection.filter((id) => Boolean(state.scene.nodes[id]));
  }

  private getNextSelection(command: EditorCommand, nextState: DocumentState) {
    switch (command.type) {
      case "加载文档":
        return [];
      case "新增节点":
        return [command.payload.node.id];
      case "删除节点": {
        const toDelete = new Set(command.payload.nodeIds);
        return this.filterExistingSelection(
          this.editState.selection.filter((id) => !toDelete.has(id)),
          nextState,
        );
      }
      case "设置业务属性": {
        if (!command.payload.nextNodeId) {
          return this.filterExistingSelection(
            this.editState.selection,
            nextState,
          );
        }
        return this.filterExistingSelection(
          this.editState.selection.map((id) =>
            id === command.payload.nodeId ? command.payload.nextNodeId! : id,
          ),
          nextState,
        );
      }
      default:
        return this.filterExistingSelection(
          this.editState.selection,
          nextState,
        );
    }
  }

  private applyCommand(
    command: EditorCommand,
    state: DocumentState,
  ): DocumentState {
    return this.commandRegistry.execute(state, command, {
      now: new Date().toISOString(),
    });
  }

  private resolveBusinessCommandCommitLabel(kind: BusinessCommandId) {
    switch (kind) {
      case "extract-carline":
        return "提取车线";
      case "mark-gear":
        return "标记档位";
      case "mark-odd-even":
        return "标记单双";
    }
  }
}
