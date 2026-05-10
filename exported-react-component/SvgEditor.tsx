import type { CSSProperties } from "react";
import { EditorProvider } from "./app/EditorContext";
import { EditorShell } from "./layers/view/EditorShell";
import "./index.css";
import "./App.css";

export interface SvgEditorProps {
  className?: string;
  style?: CSSProperties;
}

export function SvgEditor({ className, style }: SvgEditorProps) {
  return (
    <div className={className} style={style}>
      <EditorProvider>
        <EditorShell />
      </EditorProvider>
    </div>
  );
}
