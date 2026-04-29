import type { EditorCommand } from "./commands";
import type { DocumentState } from "../data/types";

export interface HistoryEntry {
  label: string;
  command: EditorCommand;
  before: DocumentState;
  after: DocumentState;
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  maxSize: number;
}

export function createHistory(maxSize = 100): HistoryState {
  return { past: [], future: [], maxSize };
}

export class HistoryManager {
  private state: HistoryState;

  constructor(maxSize = 100) {
    this.state = createHistory(maxSize);
  }

  getState() {
    return this.state;
  }

  record(entry: HistoryEntry) {
    this.state = {
      ...this.state,
      past: [...this.state.past.slice(-(this.state.maxSize - 1)), entry],
      future: [],
    };
  }

  undo() {
    const last = this.state.past.at(-1);
    if (!last) return null;

    this.state = {
      ...this.state,
      past: this.state.past.slice(0, -1),
      future: [last, ...this.state.future],
    };

    return last;
  }

  redo() {
    const next = this.state.future[0];
    if (!next) return null;

    this.state = {
      ...this.state,
      past: [...this.state.past, next],
      future: this.state.future.slice(1),
    };

    return next;
  }
}
