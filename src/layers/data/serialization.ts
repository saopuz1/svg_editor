import type { DocumentState } from './types';

export function serializeDocument(state: DocumentState): string {
  return JSON.stringify(state, null, 2);
}

export function parseDocument(raw: string): DocumentState {
  const parsed = JSON.parse(raw) as DocumentState;
  if (!parsed?.meta?.documentId) {
    throw new Error('Invalid document JSON');
  }
  return parsed;
}
