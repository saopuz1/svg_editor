import type { NodeId } from './types';
import type { DocumentState, EditorNode } from './types';

export type DataLayerListener = () => void;

export interface DataLayer {
  getState(): DocumentState;
  setState(next: DocumentState): void;
  update(updater: (prev: DocumentState) => DocumentState): void;
  updateNode(nodeId: NodeId, updater: (prev: EditorNode) => EditorNode): void;
  subscribe(listener: DataLayerListener): () => void;
}

export class DataStore implements DataLayer {
  private state: DocumentState;
  private listeners = new Set<DataLayerListener>();

  constructor(initial: DocumentState) {
    this.state = initial;
  }

  getState = () => this.state;

  setState = (next: DocumentState) => {
    this.state = next;
    this.emit();
  };

  update = (updater: (prev: DocumentState) => DocumentState) => {
    this.state = updater(this.state);
    this.emit();
  };

  updateNode = (nodeId: NodeId, updater: (prev: EditorNode) => EditorNode) => {
    const prev = this.state.nodes[nodeId];
    if (!prev) return;

    this.update((state) => ({
      ...state,
      nodes: {
        ...state.nodes,
        [nodeId]: updater(prev),
      },
    }));
  };

  subscribe = (listener: DataLayerListener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function createDefaultDocument(): DocumentState {
  const now = new Date().toISOString();

  return {
    meta: {
      documentId: crypto.randomUUID(),
      name: 'Untitled',
      version: 1,
      createdAt: now,
      updatedAt: now,
      sourceFormat: 'unknown',
    },
    canvas: {
      width: 960,
      height: 600,
      backgroundColor: '#ffffff',
    },
    business: {
      svg: '',
      车线: [],
      标注样式: {},
      自动修改器: [],
    },
    nodes: {},
    order: [],
    autoModifiers: [],
  };
}
