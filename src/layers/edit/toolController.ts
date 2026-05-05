import type { Canvas } from 'fabric';
import type { Editor } from '../../kernel/createEditor';
import type { ToolId } from './tools';

export interface ToolControllerContext {
  canvas: Canvas;
  editor: Editor;
  onSelectLassoGesture?: (
    points: Array<{ x: number; y: number }>,
  ) => boolean;
}

export interface ToolController {
  id: ToolId;
  activate(context: ToolControllerContext): () => void;
}

export class ToolControllerRegistry {
  private controllers = new Map<ToolId, ToolController>();

  register(controller: ToolController) {
    this.controllers.set(controller.id, controller);
  }

  get(toolId: ToolId) {
    return this.controllers.get(toolId);
  }

  has(toolId: ToolId) {
    return this.controllers.has(toolId);
  }
}
