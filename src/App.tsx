import { EditorProvider } from './app/EditorContext';
import { EditorShell } from './layers/view/EditorShell';
import './App.css';

export default function App() {
  return (
    <EditorProvider>
      <EditorShell />
    </EditorProvider>
  );
}
