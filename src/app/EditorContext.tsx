import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { DocumentState } from '../layers/data/types';
import type { EditState } from '../layers/edit/editLayer';
import type { Editor } from '../kernel/createEditor';
import { createEditor } from '../kernel/createEditor';

const EditorContext = createContext<Editor | null>(null);

export function EditorProvider({
  children,
  editor,
}: {
  children: ReactNode;
  editor?: Editor | null;
}) {
  const editorRef = useRef<Editor | null>(null);
  if (!editorRef.current) {
    editorRef.current = createEditor();
  }

  const contextEditor = editor ?? editorRef.current;

  return (
    <EditorContext.Provider value={contextEditor}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) {
    throw new Error('useEditor must be used within <EditorProvider />');
  }
  return editor;
}

export function useDocumentState(): DocumentState {
  const editor = useEditor();

  const state = useSyncExternalStore(
    editor.data.subscribe,
    editor.data.getState,
    editor.data.getState,
  );

  return useMemo(() => state, [state]);
}

export function useEditState(): EditState {
  const editor = useEditor();

  const state = useSyncExternalStore(
    editor.edit.subscribe,
    editor.edit.getState,
    editor.edit.getState,
  );

  return useMemo(() => state, [state]);
}
