import type { DocumentState, EditorNode } from "../data/types";
import type { CommandType, EditorCommand } from "./commands";

export interface CommandContext {
  now: string;
}

export type CommandHandler<TType extends CommandType> = {
  type: TType;
  execute(
    state: DocumentState,
    command: Extract<EditorCommand, { type: TType }>,
    context: CommandContext,
  ): DocumentState;
};

export class CommandRegistry {
  private handlers = new Map<CommandType, CommandHandler<CommandType>>();

  register<TType extends CommandType>(handler: CommandHandler<TType>) {
    this.handlers.set(
      handler.type,
      handler as unknown as CommandHandler<CommandType>,
    );
  }

  execute(
    state: DocumentState,
    command: EditorCommand,
    context: CommandContext,
  ): DocumentState {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      throw new Error(`No command handler registered for "${command.type}"`);
    }
    return handler.execute(state, command, context);
  }

  getTypes(): CommandType[] {
    return [...this.handlers.keys()];
  }
}

export function registerDefaultCommandHandlers(registry: CommandRegistry) {
  registry.register({
    type: "加载文档",
    execute: (_state, command) => command.payload.document,
  });

  registry.register({
    type: "新增节点",
    execute: (state, command, context) => {
      const node = command.payload.node;
      const nextOrder = [...state.scene.order, node.id];
      const nextNode: EditorNode = { ...node, zIndex: nextOrder.length - 1 };

      return {
        ...state,
        meta: {
          ...state.meta,
          updatedAt: context.now,
          version: state.meta.version + 1,
        },
        scene: {
          ...state.scene,
          nodes: { ...state.scene.nodes, [node.id]: nextNode },
          order: nextOrder,
        },
      };
    },
  });

  registry.register({
    type: "更新图形属性",
    execute: (state, command, context) => {
      const prev = state.scene.nodes[command.payload.nodeId];
      if (!prev) return state;

      const patch = command.payload.patch;
      const next: EditorNode = {
        ...prev,
        fabricObject: {
          ...prev.fabricObject,
          ...patch,
        },
      };

      return {
        ...state,
        meta: {
          ...state.meta,
          updatedAt: context.now,
          version: state.meta.version + 1,
        },
        scene: {
          ...state.scene,
          nodes: { ...state.scene.nodes, [prev.id]: next },
        },
      };
    },
  });

  registry.register({
    type: "批量更新图形属性",
    execute: (state, command, context) => {
      if (command.payload.patches.length === 0) return state;

      const nextNodes = { ...state.scene.nodes };
      let changed = false;

      for (const item of command.payload.patches) {
        const prev = nextNodes[item.nodeId];
        if (!prev) continue;

        nextNodes[item.nodeId] = {
          ...prev,
          fabricObject: {
            ...prev.fabricObject,
            ...item.patch,
          },
        };
        changed = true;
      }

      if (!changed) return state;

      return {
        ...state,
        meta: {
          ...state.meta,
          updatedAt: context.now,
          version: state.meta.version + 1,
        },
        scene: {
          ...state.scene,
          nodes: nextNodes,
        },
      };
    },
  });

  registry.register({
    type: "设置业务属性",
    execute: (state, command, context) => {
      const prev = state.scene.nodes[command.payload.nodeId];
      if (!prev) return state;

      const next: EditorNode = {
        ...prev,
        business: command.payload.business,
      };

      return {
        ...state,
        meta: {
          ...state.meta,
          updatedAt: context.now,
          version: state.meta.version + 1,
        },
        scene: {
          ...state.scene,
          nodes: { ...state.scene.nodes, [prev.id]: next },
        },
      };
    },
  });

  registry.register({
    type: "更新车线字段",
    execute: (state, command, context) => {
      const prev = state.scene.nodes[command.payload.nodeId];
      if (!prev) return state;
      if (prev.business.type !== "车线") return state;

      const next: EditorNode = {
        ...prev,
        business: {
          ...prev.business,
          尺数: command.payload.尺数 ?? prev.business.尺数,
          是双数: command.payload.是双数 ?? prev.business.是双数,
        },
      };

      return {
        ...state,
        meta: {
          ...state.meta,
          updatedAt: context.now,
          version: state.meta.version + 1,
        },
        scene: {
          ...state.scene,
          nodes: { ...state.scene.nodes, [prev.id]: next },
        },
      };
    },
  });

  registry.register({
    type: "设置自动修改器",
    execute: (state, command, context) => ({
      ...state,
      meta: {
        ...state.meta,
        updatedAt: context.now,
        version: state.meta.version + 1,
      },
      domain: {
        ...state.domain,
        自动修改器: command.payload.autoModifiers,
      },
    }),
  });

  registry.register({
    type: "删除节点",
    execute: (state, command, context) => {
      const toDelete = new Set(command.payload.nodeIds);
      const nextNodes = { ...state.scene.nodes };
      for (const id of toDelete) {
        delete nextNodes[id];
      }
      const nextOrder = state.scene.order.filter((id) => !toDelete.has(id));

      return {
        ...state,
        meta: {
          ...state.meta,
          updatedAt: context.now,
          version: state.meta.version + 1,
        },
        scene: {
          ...state.scene,
          nodes: nextNodes,
          order: nextOrder,
        },
      };
    },
  });
}
