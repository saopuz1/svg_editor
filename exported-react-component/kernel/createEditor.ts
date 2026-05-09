import { DataStore, createDefaultDocument } from "../layers/data/store";
import {
  CommandRegistry,
  registerDefaultCommandHandlers,
} from "../layers/edit/commandRegistry";
import { EditLayer } from "../layers/edit/editLayer";
import { HistoryManager } from "../layers/edit/history";
import { ToolControllerRegistry } from "../layers/edit/toolController";
import { registerDefaultFabricToolControllers } from "../rendering/fabric/fabricToolControllers";

/**
 * Version C 第一阶段的内核入口。
 * 当前先保留 `data + edit` 两个运行时能力，后续可继续扩展为
 * history / commands / tools / renderer / extensions 等更完整的 kernel facade。
 */
export interface EditorKernel {
  data: DataStore;
  edit: EditLayer;
  commandRegistry: CommandRegistry;
  history: HistoryManager;
  toolRegistry: ToolControllerRegistry;
}

/** 兼容旧命名，减少第一阶段重构的迁移成本。 */
export type Editor = EditorKernel;

export function createEditor(): EditorKernel {
  const data = new DataStore(createDefaultDocument());
  const commandRegistry = new CommandRegistry();
  const history = new HistoryManager();
  const toolRegistry = new ToolControllerRegistry();

  registerDefaultCommandHandlers(commandRegistry);
  registerDefaultFabricToolControllers(toolRegistry);

  const edit = new EditLayer(data, commandRegistry, history);

  return { data, edit, commandRegistry, history, toolRegistry };
}
