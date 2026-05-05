import type {
  AutoModifierConfig,
  DocumentState,
  DmlValue,
  EditorNode,
  NodeId,
} from "../data/types";

// ─── DML 值计算 ───────────────────────────────────────────────────────────────

/**
 * 按修改器顺序为所有车线节点计算 DML 值。
 * - 后面的修改器会覆盖前面的（last-write-wins）
 * - 未被任何修改器覆盖的车线不会出现在结果 Map 中
 * - 区间内按「编号」升序排列，循环取 pattern[i % len]
 */
export function computeDmlAssignments(
  doc: DocumentState,
  modifiers: AutoModifierConfig[],
): Map<NodeId, DmlValue> {
  // 收集所有车线节点（保留 nodeId 而非 business.id，便于直接操作 scene）
  const carlines: Array<{
    nodeId: NodeId;
    编号: number;
    区域: string;
    档位: string;
  }> = [];

  for (const nodeId of doc.scene.order) {
    const node = doc.scene.nodes[nodeId];
    if (!node || node.business.type !== "车线") continue;
    carlines.push({
      nodeId,
      编号: node.business.编号,
      区域: node.business.区域,
      档位: node.business.档位,
    });
  }

  const result = new Map<NodeId, DmlValue>();

  for (const mod of modifiers) {
    // 未显式设置 启用 时视为启用；仅 false 时跳过
    if (mod.启用 === false) continue;
    const pattern = mod.规律 as DmlValue[];
    if (pattern.length === 0) continue;

    if (mod.type === "按区域自动标注DML") {
      for (const range of mod.范围) {
        const matching = carlines
          .filter(
            (c) =>
              c.区域 === range.区域 &&
              c.编号 >= range.开始 &&
              c.编号 <= range.结束,
          )
          .sort((a, b) => a.编号 - b.编号);

        matching.forEach((c, idx) => {
          result.set(c.nodeId, pattern[idx % pattern.length]);
        });
      }
    } else if (mod.type === "按档位自动标注DML") {
      for (const range of mod.范围) {
        const matching = carlines
          .filter(
            (c) =>
              c.档位 === range.档位 &&
              c.编号 >= range.开始 &&
              c.编号 <= range.结束,
          )
          .sort((a, b) => a.编号 - b.编号);

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
 * 优先取该车线对应的「车线编号」标注节点的 left/top，
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
      return {
        x: node.fabricObject.left as number,
        y: node.fabricObject.top as number,
      };
    }
  }

  // Fallback：车线节点自身坐标
  const node = doc.scene.nodes[carlineNodeId];
  return {
    x: typeof node?.fabricObject.left === "number"
      ? (node.fabricObject.left as number)
      : 0,
    y: typeof node?.fabricObject.top === "number"
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
      left: position.x,
      top: position.y,
      text: dmlValue,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: 18,
      fill: "#111111",
      width: 40,
      textAlign: "center",
      originX: "left",
      originY: "top",
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

    // 4. 更新车线 business.DML
    nextNodes[carlineNodeId] = {
      ...carlineNode,
      business: { ...carlineNode.business, DML: dmlValue },
    };

    // 3. 创建 DML 标注节点（使用预分配 ID）
    const dmlNodeId = carlineNode.business.标注NodeId.DML;
    const position = resolveDmlPosition(cleanDoc, carlineNodeId);
    nextNodes[dmlNodeId] = createDmlAnnotationNode(
      dmlNodeId,
      carlineNode.business.id,
      dmlValue,
      position,
    );
    if (!nextOrder.includes(dmlNodeId)) {
      nextOrder.push(dmlNodeId);
    }

    carlineIdToDml.set(carlineNode.business.id, dmlValue);
  }

  // Step 5：同步 domain.车线
  const nextDomainCarlines = doc.domain.车线.map((c) => {
    const dml = carlineIdToDml.get(c.id);
    return dml != null ? { ...c, DML: dml } : c;
  });

  return {
    ...doc,
    scene: { ...doc.scene, nodes: nextNodes, order: nextOrder },
    domain: { ...doc.domain, 车线: nextDomainCarlines },
  };
}
