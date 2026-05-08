import type {
  AutoModifierConfig,
  DocumentState,
  DmlValue,
  EditorNode,
  NodeId,
} from "../data/types";
import { ensureAnnotationNodeId } from "../data/idRules";
import {
  buildBusinessCommandLabelLayout,
  resolveBusinessCommandAnnotationAnchor,
  resolveBusinessCommandLabelFontSize,
} from "./businessCommandLabelStyle";

// ─── DML 值计算 ───────────────────────────────────────────────────────────────

/**
 * 按修改器顺序为所有车线节点计算 DML 值。
 * - 后面的修改器会覆盖前面的（last-write-wins）
 * - 未被任何修改器覆盖的车线不会出现在结果 Map 中
 * - 区间内按「车线编号」排序后，循环取 pattern[i % len]
 */
export function computeDmlAssignments(
  doc: DocumentState,
  modifiers: AutoModifierConfig[],
): Map<NodeId, DmlValue> {
  const carlines: Array<{
    nodeId: NodeId;
    车线编号: string;
    区域: string;
    档位: string;
  }> = [];

  for (const nodeId of doc.scene.order) {
    const node = doc.scene.nodes[nodeId];
    if (!node || node.business.type !== "车线") continue;
    carlines.push({
      nodeId,
      车线编号: node.business.车线编号,
      区域: node.business.区域,
      档位: node.business.档位,
    });
  }

  const result = new Map<NodeId, DmlValue>();
  const normalizePercent = (value: unknown) => {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) return 0;
    const normalized = Math.abs(num) > 1 ? num / 100 : num;
    return Math.max(0, Math.min(1, normalized));
  };
  const parse车线排序值 = (value: unknown): number | null => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const normalized = raw.replace(/[^0-9.+-]/g, "");
    if (!normalized) return null;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  };
  const compare车线顺序 = (
    a: { 车线编号: string; nodeId: NodeId },
    b: { 车线编号: string; nodeId: NodeId },
  ) => {
    const numA = parse车线排序值(a.车线编号);
    const numB = parse车线排序值(b.车线编号);
    if (numA != null && numB != null && numA !== numB) return numA - numB;
    if (numA != null && numB == null) return -1;
    if (numA == null && numB != null) return 1;

    const codeCompare = String(a.车线编号 ?? "").localeCompare(
      String(b.车线编号 ?? ""),
      undefined,
      { numeric: true, sensitivity: "base" },
    );
    if (codeCompare !== 0) return codeCompare;
    return String(a.nodeId).localeCompare(String(b.nodeId));
  };
  const selectByPercent = <T>(items: T[], start: unknown, end: unknown) => {
    if (items.length === 0) return [];
    const from = Math.min(normalizePercent(start), normalizePercent(end));
    const to = Math.max(normalizePercent(start), normalizePercent(end));
    if (from === to) {
      return [
        items[Math.min(items.length - 1, Math.floor(from * items.length))],
      ];
    }
    return items.filter((_, index) => {
      const itemStart = index / items.length;
      const itemEnd = (index + 1) / items.length;
      return itemStart < to && itemEnd > from;
    });
  };

  for (const mod of modifiers) {
    const pattern = mod.规律 as DmlValue[];
    if (pattern.length === 0) continue;

    if (mod.type === "按区域自动标注DML") {
      for (const range of mod.范围) {
        const matching = selectByPercent(
          carlines.filter((c) => c.区域 === range.区域).sort(compare车线顺序),
          range.开始,
          range.结束,
        );

        matching.forEach((c, idx) => {
          result.set(c.nodeId, pattern[idx % pattern.length]);
        });
      }
    } else if (mod.type === "按档位自动标注DML") {
      for (const range of mod.范围) {
        const matching = selectByPercent(
          carlines.filter((c) => c.档位 === range.档位).sort(compare车线顺序),
          range.开始,
          range.结束,
        );

        matching.forEach((c, idx) => {
          result.set(c.nodeId, pattern[idx % pattern.length]);
        });
      }
    }
  }

  return result;
}

// ─── 位置解析 ─────────────────────────────────────────────────────────────────

/**
 * 获取 DML 标注的放置位置：
 * 优先取该车线对应的「车线编号」标注节点中心锚点，
 * 若不存在则 fallback 到车线节点自身坐标。
 */
function resolveDmlPosition(
  doc: DocumentState,
  carlineNodeId: NodeId,
): { x: number; y: number } {
  // 通过 business 关系查找「车线编号」标注节点
  for (const id of doc.scene.order) {
    const node = doc.scene.nodes[id];
    if (
      node?.business.type === "标注" &&
      node.business.字段 === "车线编号" &&
      node.business.归属车线Id === carlineNodeId &&
      typeof node.fabricObject.left === "number" &&
      typeof node.fabricObject.top === "number"
    ) {
      return resolveBusinessCommandAnnotationAnchor(node);
    }
  }

  // Fallback：车线节点自身坐标
  const node = doc.scene.nodes[carlineNodeId];
  return {
    x:
      typeof node?.fabricObject.left === "number"
        ? (node.fabricObject.left as number)
        : 0,
    y:
      typeof node?.fabricObject.top === "number"
        ? (node.fabricObject.top as number)
        : 0,
  };
}

// ─── 标注节点工厂 ─────────────────────────────────────────────────────────────

function createDmlAnnotationNode(
  dmlNodeId: NodeId,
  carlineId: string,
  dmlValue: DmlValue,
  position: { x: number; y: number },
  fontSize: number,
): EditorNode {
  return {
    id: dmlNodeId,
    name: "DML标注",
    locked: true,
    hidden: false,
    zIndex: 0,
    business: { type: "标注", 字段: "DML", 归属车线Id: carlineId },
    fabricObject: {
      type: "textbox",
      text: dmlValue,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fill: "#111111",
      ...buildBusinessCommandLabelLayout(dmlValue, position, fontSize),
      selectable: false,
      evented: false,
    },
  };
}

// ─── 主应用函数 ───────────────────────────────────────────────────────────────

/**
 * 将 domain.自动修改器 中的 DML 规则应用到文档：
 * 1. 移除所有现有 DML 标注节点（business.字段 === "DML"）
 * 2. 按修改器顺序重新计算 DML 值（后规则覆盖前规则）
 * 3. 在对应「车线编号」标注位置创建 DML 标注节点（使用预分配 ID）
 * 4. 更新车线节点 business.DML 字段
 * 5. 同步更新 domain.车线[i].DML
 */
export function applyDmlModifiers(doc: DocumentState): DocumentState {
  const modifiers = doc.domain.自动修改器;
  const dmlFontSize = resolveBusinessCommandLabelFontSize(doc, "DML");

  // Step 1：移除现有 DML 标注节点
  const existingDmlIds = new Set<NodeId>();
  for (const nodeId of doc.scene.order) {
    const node = doc.scene.nodes[nodeId];
    if (node?.business.type === "标注" && node.business.字段 === "DML") {
      existingDmlIds.add(nodeId);
    }
  }

  const nextNodes: DocumentState["scene"]["nodes"] = Object.fromEntries(
    Object.entries(doc.scene.nodes).filter(([id]) => !existingDmlIds.has(id)),
  );
  const nextOrder: NodeId[] = doc.scene.order.filter(
    (id) => !existingDmlIds.has(id),
  );

  for (const nodeId of nextOrder) {
    const node = nextNodes[nodeId];
    if (!node || node.business.type !== "车线") continue;
    const nextAnnotationNodeId = { ...node.business.标注NodeId };
    delete nextAnnotationNodeId.DML;
    nextNodes[nodeId] = {
      ...node,
      business: {
        ...node.business,
        DML: undefined,
        标注NodeId: nextAnnotationNodeId,
      },
    };
  }

  // 用于位置查询的快照（仅含非 DML 节点；后续写入不影响已有位置数据）
  const cleanDoc: DocumentState = {
    ...doc,
    scene: { ...doc.scene, nodes: nextNodes, order: nextOrder },
  };

  // Step 2：计算赋值
  const assignments = computeDmlAssignments(cleanDoc, modifiers);

  // 用于同步 domain.车线 的映射：carlineId → dmlValue
  const carlineIdToDml = new Map<string, DmlValue>();

  // Step 3 & 4：写入标注节点 + 更新车线 DML 字段
  for (const [carlineNodeId, dmlValue] of assignments) {
    const carlineNode = nextNodes[carlineNodeId];
    if (!carlineNode || carlineNode.business.type !== "车线") continue;

    // 3. 创建 DML 标注节点（使用预分配 ID）
    const dmlNodeId = ensureAnnotationNodeId(
      "DML",
      carlineNode.business.标注NodeId.DML,
    );
    const nextCarlineBusiness = {
      ...carlineNode.business,
      DML: dmlValue,
      标注NodeId: {
        ...carlineNode.business.标注NodeId,
        DML: dmlNodeId,
      },
    };
    nextNodes[carlineNodeId] = {
      ...carlineNode,
      business: nextCarlineBusiness,
    };
    const position = resolveDmlPosition(cleanDoc, carlineNodeId);
    nextNodes[dmlNodeId] = createDmlAnnotationNode(
      dmlNodeId,
      carlineNode.business.id,
      dmlValue,
      position,
      dmlFontSize,
    );
    if (!nextOrder.includes(dmlNodeId)) {
      nextOrder.push(dmlNodeId);
    }

    carlineIdToDml.set(carlineNode.business.id, dmlValue);
  }

  // Step 5：同步 domain.车线
  const nextDomainCarlines = doc.domain.车线.map((c) => {
    const nextAnnotationNodeId = { ...c.标注NodeId };
    delete nextAnnotationNodeId.DML;
    const dml = carlineIdToDml.get(c.id);
    if (dml == null) {
      return {
        ...c,
        DML: undefined,
        标注NodeId: nextAnnotationNodeId,
      };
    }
    const sceneNode = nextNodes[c.id];
    return {
      ...c,
      DML: dml,
      标注NodeId:
        sceneNode && sceneNode.business.type === "车线"
          ? sceneNode.business.标注NodeId
          : nextAnnotationNodeId,
    };
  });

  return {
    ...doc,
    scene: { ...doc.scene, nodes: nextNodes, order: nextOrder },
    domain: { ...doc.domain, 车线: nextDomainCarlines },
  };
}
