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
  const hostClassName = ["svgEditorHost", className].filter(Boolean).join(" ");
  return (
    <div className={hostClassName} style={style}>
      <EditorProvider>
        <EditorShell />
      </EditorProvider>
    </div>
  );
}
