import { useEffect, useMemo, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { BusinessCommandDialog } from "../../components/BusinessCommandDialog";
import { MenuDropdown } from "../../components/MenuDropdown";
import {
  useDocumentState,
  useEditState,
  useEditor,
} from "../../app/EditorContext";
import { BusinessCommandHost } from "../businessCommands/host/BusinessCommandHost";
import type {
  AnnotationField,
  AutoModifierConfig,
  NodeBusiness,
  NodeId,
  标注样式,
} from "../data/types";
import {
  DEFAULT_ANNOTATION_BORDER_STYLE,
  resolveNodeAnnotationStyle,
} from "../data/annotationStyles";
import {
  createBusinessForFabricTypeAndType,
  getAllowedBusinessTypesForFabricType,
  isLineLikeNode,
  isTextLikeNode,
} from "../data/business";
import {
  createNodeIdForBusiness,
  shouldRegenerateNodeIdOnBusinessChange,
} from "../data/idRules";
import { serializeDocument } from "../data/serialization";
import { createCommand } from "../edit/commands";
import {
  CANCEL_ACTIVE_DRAWING_EVENT,
  resolveShortcutAction,
  shouldIgnoreGlobalShortcutTarget,
} from "../edit/shortcuts";
import type { ToolId } from "../edit/tools";
import { readNodeNumberProp } from "../../rendering/fabric/fabricProjection";
import { FabricStage, type FabricStageApi } from "./FabricStage";
import { getInspectorSections, type InspectorFieldId } from "./inspectorSchema";
import { DEFAULT_VIEW_STATE, type ViewState } from "./viewState";

const ANNOTATION_FIELD_OPTIONS: AnnotationField[] = [
  "车线编号",
  "区域",
  "档位",
  "单双",
  "DML",
];
const FONT_FAMILY_OPTIONS = [
  {
    label: "系统默认",
    value: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  {
    label: "苹方",
    value: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  {
    label: "微软雅黑",
    value: '"Microsoft YaHei", "PingFang SC", sans-serif',
  },
  {
    label: "宋体",
    value: '"SimSun", "Songti SC", serif',
  },
  {
    label: "黑体",
    value: '"SimHei", "Heiti SC", sans-serif',
  },
  {
    label: "等线",
    value: '"DengXian", "Microsoft YaHei", sans-serif',
  },
  {
    label: "Arial",
    value: "Arial, sans-serif",
  },
  {
    label: "新罗马",
    value: '"Times New Roman", serif',
  },
  {
    label: "等宽",
    value: '"Courier New", monospace',
  },
] as const;

type BusinessCommandId = "extract-carline" | "mark-gear" | "mark-odd-even";

const BUSINESS_COMMAND_FLOWS: Record<
  BusinessCommandId,
  {
    menuLabel: string;
    title: string;
    summary: string;
    steps: Array<{
      title: string;
      description: string;
    }>;
  }
> = {
  "extract-carline": {
    menuLabel: "提取车线",
    title: "提取车线",
    summary: "按区域逐步提取车线，业务命令模式使用独立 SVG 命中层。",
    steps: [
      {
        title: "当前区域",
        description: "选择区域、设置车线长度，并在 SVG 命中层里刷选线条。",
      },
    ],
  },
  "mark-gear": {
    menuLabel: "标记档位",
    title: "标记档位",
    summary: "按步骤确认目标对象、档位规则和最终写入。",
    steps: [
      {
        title: "选择目标对象",
        description: "确认本次需要写入档位信息的对象范围，避免误修改无关节点。",
      },
      {
        title: "设置档位规则",
        description: "核对档位来源、映射方式和写入策略，确保标记结果符合预期。",
      },
      {
        title: "完成标记",
        description:
          "确认后结束档位标记流程，后续可在这里接入实际业务执行逻辑。",
      },
    ],
  },
  "mark-odd-even": {
    menuLabel: "标记单双",
    title: "标记单双",
    summary: "按步骤确认目标对象、单双规则和执行结果。",
    steps: [
      {
        title: "选择目标对象",
        description:
          "确认本次需要标记单双属性的对象范围，避免影响当前文档中的其他对象。",
      },
      {
        title: "设置单双规则",
        description: "核对单双判定依据、继承方式和覆盖策略，保证结果可控。",
      },
      {
        title: "完成标记",
        description:
          "确认后结束单双标记流程，后续可在这里接入实际业务执行逻辑。",
      },
    ],
  },
};

function normalizeHexColor(value: string, fallback: string) {
  return /^#([0-9a-fA-F]{6})$/.test(value) ? value : fallback;
}

function AnnotationColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const normalized = normalizeHexColor(value, fallback);

  return (
    <div className="row">
      <div className="label">{label}</div>
      <div className="colorField">
        <button
          type="button"
          className={`colorTrigger ${open ? "colorTriggerActive" : ""}`}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span
            className="colorSwatch"
            style={{ backgroundColor: normalized }}
            aria-hidden="true"
          />
          <span className="colorValue">{normalized.toUpperCase()}</span>
        </button>
        {open ? (
          <div className="colorPopover">
            <HexColorPicker color={normalized} onChange={onChange} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function useResizableRightPanel(initialWidth: number) {
  const [width, setWidth] = useState(initialWidth);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(560, Math.max(320, window.innerWidth - e.clientX));
      setWidth(next);
    };

    const onUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onMouseDown = () => {
    draggingRef.current = true;
  };

  return { width, onMouseDown };
}

function iconForTool(toolId: ToolId) {
  switch (toolId) {
    case "select-box":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 2l12 11.2-5.8.5 3.3 7.3-2.2.9-3.2-7.4-4.4 4.7z" />
        </svg>
      );
    case "select-lasso":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M3 3l18 18M5 19L19 5"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      );
    case "draw-path":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 21c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm14-16c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zM6.6 19.8l10.8-13.6c.4-.5 1.2-.6 1.7-.2.5.4.6 1.2.2 1.7L8.5 21.3c-.4.5-1.2.6-1.7.2-.5-.4-.6-1.2-.2-1.7z" />
        </svg>
      );
    case "draw-bezier":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 18c0-1.1.9-2 2-2 1.1 0 2 .9 2 2s-.9 2-2 2c-1.1 0-2-.9-2-2zm10-12c0-1.1.9-2 2-2 1.1 0 2 .9 2 2s-.9 2-2 2c-1.1 0-2-.9-2-2zM7 18Q12 4 17 6"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      );
    case "draw-line":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 19L19 5"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      );
    case "draw-text":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4v3h5.5v12h3V7H19V4z" />
        </svg>
      );
    default:
      return null;
  }
}

export function EditorShell() {
  const editor = useEditor();
  const document = useDocumentState();
  const editState = useEditState();

  const stageRef = useRef<FabricStageApi | null>(null);

  const [importError, setImportError] = useState<string>("");
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);
  const [activeBusinessCommandId, setActiveBusinessCommandId] =
    useState<BusinessCommandId | null>(null);
  const [businessCommandStepIndex, setBusinessCommandStepIndex] = useState(0);
  const [showBusinessCommandExitConfirm, setShowBusinessCommandExitConfirm] =
    useState(false);
  const [businessCommandSvgMarkup, setBusinessCommandSvgMarkup] = useState("");

  const [rightTab, setRightTab] = useState<"inspector" | "rules">("inspector");
  const [newModifierType, setNewModifierType] = useState<"按区域自动标注DML" | "按档位自动标注DML">("按区域自动标注DML");

  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const { width: rightWidth, onMouseDown: onResizeMouseDown } =
    useResizableRightPanel(380);

  const activeToolId = editState.activeToolId;
  const tools = editState.tools;
  const selection = editState.selection;
  const history = editor.edit.getHistory();
  const isExtractCarlineHostOpen =
    activeBusinessCommandId === "extract-carline";
  const activeLegacyBusinessFlow =
    null as (typeof BUSINESS_COMMAND_FLOWS)[keyof typeof BUSINESS_COMMAND_FLOWS] | null;

  const selectedNode = useMemo(() => {
    const id = selection[0];
    return id ? document.scene.nodes[id] : null;
  }, [document.scene.nodes, selection]);
  const inspectorSections = useMemo(
    () => (selectedNode ? getInspectorSections(selectedNode) : []),
    [selectedNode],
  );

  const patchGraphic = (
    nodeId: NodeId,
    patch: Record<string, unknown>,
    label: string,
  ) => {
    editor.edit.execute(
      createCommand("更新图形属性", { nodeId, patch }),
      label,
    );
  };

  const setBusiness = (
    nodeId: NodeId,
    business: NodeBusiness,
    label: string,
    nextNodeId?: NodeId,
  ) => {
    editor.edit.execute(
      createCommand("设置业务属性", { nodeId, business, nextNodeId }),
      label,
    );
  };

  const setNodeLocked = (nodeId: NodeId, locked: boolean) => {
    editor.edit.execute(
      createCommand("设置节点状态", { nodeId, locked }),
      locked ? "锁定节点" : "解锁节点",
    );
  };

  const updateCarlineFields = (
    nodeId: NodeId,
    payload: { 尺数?: number; 是双数?: boolean },
  ) => {
    editor.edit.execute(
      createCommand("更新车线字段", { nodeId, ...payload }),
      "更新车线字段",
    );
  };

  const updateNodeAnnotationStyle = (
    nodeId: NodeId,
    style: 标注样式,
    label: string,
  ) => {
    editor.edit.execute(
      createCommand("设置节点标注样式", { nodeId, style }),
      label,
    );
  };

  const updateSelectedNodeAnnotationStyle = (
    recipe: (prev: 标注样式) => 标注样式,
    label: string,
  ) => {
    if (!selectedNode) return;
    if (!isTextLikeNode(selectedNode)) return;
    const prev = resolveNodeAnnotationStyle(
      selectedNode,
      document.domain.标注样式,
    );
    updateNodeAnnotationStyle(selectedNode.id, recipe(prev), label);
  };

  const setAutoModifiers = (mods: AutoModifierConfig[]) => {
    editor.edit.execute(
      createCommand("设置自动修改器", { autoModifiers: mods }),
      "设置自动修改器",
    );
  };

  const addModifier = () => {
    const id = crypto.randomUUID();
    const base = { id, 启用: true, 规律: ["D", "M", "L"] };
    const next: AutoModifierConfig =
      newModifierType === "按区域自动标注DML"
        ? { ...base, type: "按区域自动标注DML", 范围: [] }
        : { ...base, type: "按档位自动标注DML", 范围: [] };
    setAutoModifiers([...document.domain.自动修改器, next]);
  };

  const deleteModifier = (id: string) => {
    setAutoModifiers(document.domain.自动修改器.filter((m) => m.id !== id));
  };

  const patchModifier = (id: string, recipe: (m: AutoModifierConfig) => AutoModifierConfig) => {
    setAutoModifiers(document.domain.自动修改器.map((m) => (m.id === id ? recipe(m) : m)));
  };

  const isMarkGearHostOpen = activeBusinessCommandId === "mark-gear";
  const isMarkOddEvenHostOpen = activeBusinessCommandId === "mark-odd-even";

  useEffect(() => {
    if (!isExtractCarlineHostOpen && !isMarkGearHostOpen && !isMarkOddEvenHostOpen) {
      setBusinessCommandSvgMarkup("");
      return;
    }
    setBusinessCommandSvgMarkup(stageRef.current?.exportSvg() ?? "");
  }, [document, isExtractCarlineHostOpen, isMarkGearHostOpen, isMarkOddEvenHostOpen, viewState]);

  const openBusinessCommandDialog = (commandId: BusinessCommandId) => {
    setActiveBusinessCommandId(commandId);
    setBusinessCommandStepIndex(0);
    setShowBusinessCommandExitConfirm(false);
  };

  const requestCloseBusinessCommandDialog = () => {
    if (!activeLegacyBusinessFlow) return;
    setShowBusinessCommandExitConfirm(true);
  };

  const cancelCloseBusinessCommandDialog = () => {
    setShowBusinessCommandExitConfirm(false);
  };

  const confirmCloseBusinessCommandDialog = () => {
    setShowBusinessCommandExitConfirm(false);
    setActiveBusinessCommandId(null);
    setBusinessCommandStepIndex(0);
  };

  const goToPreviousBusinessCommandStep = () => {
    setBusinessCommandStepIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNextBusinessCommandStep = () => {
    if (!activeLegacyBusinessFlow) return;
    setBusinessCommandStepIndex((prev) =>
      Math.min(activeLegacyBusinessFlow.steps.length - 1, prev + 1),
    );
  };

  const finishBusinessCommandDialog = () => {
    if (!activeLegacyBusinessFlow) return;
    const commandTitle = activeLegacyBusinessFlow.title;
    setShowBusinessCommandExitConfirm(false);
    setActiveBusinessCommandId(null);
    setBusinessCommandStepIndex(0);
    window.alert(`${commandTitle}：流程已完成，业务逻辑待接入`);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalShortcutTarget(e.target)) return;

      const action = resolveShortcutAction({
        event: e,
        tools,
        selectionCount: selection.length,
      });
      if (!action) return;

      e.preventDefault();
      if (action.type === "undo") {
        editor.edit.undo();
        return;
      }
      if (action.type === "activate-tool") {
        editor.edit.activateTool(action.toolId);
        return;
      }
      if (action.type === "delete-selection") {
        editor.edit.execute(
          createCommand("删除节点", { nodeIds: selection }),
          "删除",
        );
        return;
      }
      if (action.type === "cancel-active-drawing") {
        window.dispatchEvent(new Event(CANCEL_ACTIVE_DRAWING_EVENT));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editor, selection, tools]);

  const renderReadOnlyField = (
    fieldId: string,
    label: string,
    value: string | number,
  ) => (
    <div className="row rowDisabled" key={fieldId}>
      <div className="label">{label}</div>
      <input
        className="input inputDisabled"
        value={String(value)}
        readOnly
        disabled
      />
    </div>
  );

  const renderToggleField = (
    fieldId: string,
    label: string,
    value: string,
    options: Array<{
      value: string;
      label: string;
      onClick: () => void;
    }>,
  ) => (
    <div className="row" key={fieldId}>
      <div className="label">{label}</div>
      <div className="toggleGroup" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`toggleButton ${value === option.value ? "toggleButtonActive" : ""}`}
            aria-pressed={value === option.value}
            onClick={option.onClick}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  const renderInspectorField = (fieldId: InspectorFieldId) => {
    if (!selectedNode) return null;
    const resolvedAnnotationStyle = isTextLikeNode(selectedNode)
      ? resolveNodeAnnotationStyle(selectedNode, document.domain.标注样式)
      : null;

    if (fieldId === "id") {
      return renderReadOnlyField(fieldId, "ID", selectedNode.id);
    }

    if (fieldId === "left") {
      return (
        <div className="row" key={fieldId}>
          <div className="label">X</div>
          <input
            className="input"
            type="number"
            value={Math.round(readNodeNumberProp(selectedNode, "left", 0))}
            onChange={(e) =>
              patchGraphic(
                selectedNode.id,
                { left: Number(e.currentTarget.value) },
                "更新X",
              )
            }
          />
        </div>
      );
    }

    if (fieldId === "top") {
      return (
        <div className="row" key={fieldId}>
          <div className="label">Y</div>
          <input
            className="input"
            type="number"
            value={Math.round(readNodeNumberProp(selectedNode, "top", 0))}
            onChange={(e) =>
              patchGraphic(
                selectedNode.id,
                { top: Number(e.currentTarget.value) },
                "更新Y",
              )
            }
          />
        </div>
      );
    }

    if (fieldId === "locked") {
      return renderToggleField(
        fieldId,
        "锁定",
        selectedNode.locked ? "locked" : "none",
        [
          {
            value: "none",
            label: "无",
            onClick: () => setNodeLocked(selectedNode.id, false),
          },
          {
            value: "locked",
            label: "锁定",
            onClick: () => setNodeLocked(selectedNode.id, true),
          },
        ],
      );
    }

    if (
      fieldId === "annotationStyleFontFamily" &&
      isTextLikeNode(selectedNode) &&
      resolvedAnnotationStyle
    ) {
      return (
        <div className="row" key={fieldId}>
          <div className="label">字体</div>
          <select
            className="input"
            value={resolvedAnnotationStyle.字体}
            onChange={(e) =>
              updateSelectedNodeAnnotationStyle(
                (s) => ({ ...s, 字体: e.currentTarget.value }),
                "更新标注样式字体",
              )
            }
          >
            {FONT_FAMILY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (
      fieldId === "annotationStyleFontSize" &&
      isTextLikeNode(selectedNode) &&
      resolvedAnnotationStyle
    ) {
      return (
        <div className="row" key={fieldId}>
          <div className="label">字号</div>
          <input
            className="input"
            type="number"
            value={resolvedAnnotationStyle.字号}
            onChange={(e) =>
              updateSelectedNodeAnnotationStyle(
                (s) => ({ ...s, 字号: Number(e.currentTarget.value) }),
                "更新标注样式字号",
              )
            }
          />
        </div>
      );
    }

    if (
      fieldId === "annotationStyleTextColor" &&
      isTextLikeNode(selectedNode) &&
      resolvedAnnotationStyle
    ) {
      return (
        <AnnotationColorField
          key={fieldId}
          label="字色"
          value={resolvedAnnotationStyle.字色}
          fallback="#111111"
          onChange={(next) =>
            updateSelectedNodeAnnotationStyle(
              (s) => ({ ...s, 字色: next }),
              "更新标注样式字色",
            )
          }
        />
      );
    }

    if (
      fieldId === "annotationStyleHasBorder" &&
      isTextLikeNode(selectedNode) &&
      resolvedAnnotationStyle
    ) {
      return renderToggleField(
        fieldId,
        "边框",
        resolvedAnnotationStyle.有边框 ? "visible" : "hidden",
        [
          {
            value: "hidden",
            label: "无",
            onClick: () =>
              updateSelectedNodeAnnotationStyle(
                (s) => ({ ...s, 有边框: undefined }),
                "更新标注样式边框显示",
              ),
          },
          {
            value: "visible",
            label: "有",
            onClick: () =>
              updateSelectedNodeAnnotationStyle((s) => {
                if (s.有边框) return s;
                return {
                  ...s,
                  有边框: { ...DEFAULT_ANNOTATION_BORDER_STYLE },
                };
              }, "更新标注样式边框显示"),
          },
        ],
      );
    }

    if (
      fieldId === "annotationStyleBorderTransparent" &&
      isTextLikeNode(selectedNode) &&
      resolvedAnnotationStyle &&
      resolvedAnnotationStyle.有边框
    ) {
      return renderToggleField(
        fieldId,
        "背景透明",
        resolvedAnnotationStyle.有边框.是否透明 ? "transparent" : "opaque",
        [
          {
            value: "opaque",
            label: "不透明",
            onClick: () =>
              updateSelectedNodeAnnotationStyle((s) => {
                if (!s.有边框) return s;
                return { ...s, 有边框: { ...s.有边框, 是否透明: false } };
              }, "更新标注样式背景透明"),
          },
          {
            value: "transparent",
            label: "透明",
            onClick: () =>
              updateSelectedNodeAnnotationStyle((s) => {
                if (!s.有边框) return s;
                return { ...s, 有边框: { ...s.有边框, 是否透明: true } };
              }, "更新标注样式背景透明"),
          },
        ],
      );
    }

    if (
      fieldId === "annotationStyleBorderBackgroundColor" &&
      isTextLikeNode(selectedNode) &&
      resolvedAnnotationStyle &&
      resolvedAnnotationStyle.有边框
    ) {
      return (
        <AnnotationColorField
          key={fieldId}
          label="背景颜色"
          value={resolvedAnnotationStyle.有边框.背景颜色}
          fallback="#ffffff"
          onChange={(next) =>
            updateSelectedNodeAnnotationStyle((s) => {
              if (!s.有边框) return s;
              return { ...s, 有边框: { ...s.有边框, 背景颜色: next } };
            }, "更新标注样式背景颜色")
          }
        />
      );
    }

    if (
      fieldId === "annotationStyleBorderShape" &&
      isTextLikeNode(selectedNode) &&
      resolvedAnnotationStyle &&
      resolvedAnnotationStyle.有边框
    ) {
      return renderToggleField(
        fieldId,
        "边框形状",
        resolvedAnnotationStyle.有边框.边框形状,
        [
          {
            value: "方形",
            label: "方形",
            onClick: () =>
              updateSelectedNodeAnnotationStyle((s) => {
                if (!s.有边框) return s;
                return { ...s, 有边框: { ...s.有边框, 边框形状: "方形" } };
              }, "更新标注样式边框形状"),
          },
          {
            value: "圆形",
            label: "圆形",
            onClick: () =>
              updateSelectedNodeAnnotationStyle((s) => {
                if (!s.有边框) return s;
                return { ...s, 有边框: { ...s.有边框, 边框形状: "圆形" } };
              }, "更新标注样式边框形状"),
          },
        ],
      );
    }

    if (
      fieldId === "annotationStyleBorderColor" &&
      isTextLikeNode(selectedNode) &&
      resolvedAnnotationStyle &&
      resolvedAnnotationStyle.有边框
    ) {
      return (
        <AnnotationColorField
          key={fieldId}
          label="边框颜色"
          value={resolvedAnnotationStyle.有边框.边框颜色}
          fallback="#111111"
          onChange={(next) =>
            updateSelectedNodeAnnotationStyle((s) => {
              if (!s.有边框) return s;
              return { ...s, 有边框: { ...s.有边框, 边框颜色: next } };
            }, "更新标注样式边框颜色")
          }
        />
      );
    }

    if (fieldId === "businessType") {
      const businessTypeOptions = getAllowedBusinessTypesForFabricType(
        selectedNode.fabricObject.type,
      );
      const isAnnotationNode = selectedNode.business.type === "标注";
      return (
        <div className="row" key={fieldId}>
          <div className="label">业务类型</div>
          <select
            className="input"
            value={selectedNode.business.type}
            disabled={isAnnotationNode}
            onChange={(e) => {
              const nextType = e.currentTarget.value as NodeBusiness["type"];
              const provisionalBusiness = createBusinessForFabricTypeAndType(
                selectedNode.fabricObject.type,
                nextType,
                { nodeId: selectedNode.id },
              );
              if (!provisionalBusiness) return;
              const nextNodeId = shouldRegenerateNodeIdOnBusinessChange(
                selectedNode,
                provisionalBusiness,
              )
                ? createNodeIdForBusiness(
                    selectedNode.fabricObject.type,
                    provisionalBusiness,
                  )
                : undefined;
              const business = createBusinessForFabricTypeAndType(
                selectedNode.fabricObject.type,
                nextType,
                { nodeId: nextNodeId ?? selectedNode.id },
              );
              if (!business) return;
              setBusiness(
                selectedNode.id,
                business,
                `设为${nextType}`,
                nextNodeId,
              );
            }}
          >
            {businessTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (
      fieldId === "carlineId" &&
      isLineLikeNode(selectedNode) &&
      selectedNode.business.type === "车线"
    ) {
      return renderReadOnlyField(fieldId, "车线ID", selectedNode.business.id);
    }

    if (
      fieldId === "carlineNumber" &&
      isLineLikeNode(selectedNode) &&
      selectedNode.business.type === "车线"
    ) {
      return renderReadOnlyField(fieldId, "编号", selectedNode.business.编号);
    }

    if (
      fieldId === "carlineArea" &&
      isLineLikeNode(selectedNode) &&
      selectedNode.business.type === "车线"
    ) {
      return renderReadOnlyField(fieldId, "区域", selectedNode.business.区域);
    }

    if (
      fieldId === "carlineCode" &&
      isLineLikeNode(selectedNode) &&
      selectedNode.business.type === "车线"
    ) {
      return renderReadOnlyField(
        fieldId,
        "车线编号",
        selectedNode.business.车线编号,
      );
    }

    if (
      fieldId === "carlineSize" &&
      isLineLikeNode(selectedNode) &&
      selectedNode.business.type === "车线"
    ) {
      return (
        <div className="row" key={fieldId}>
          <div className="label">尺数</div>
          <input
            className="input"
            type="number"
            value={selectedNode.business.尺数}
            onChange={(e) =>
              updateCarlineFields(selectedNode.id, {
                尺数: Number(e.currentTarget.value),
              })
            }
          />
        </div>
      );
    }

    if (
      fieldId === "carlineGear" &&
      isLineLikeNode(selectedNode) &&
      selectedNode.business.type === "车线"
    ) {
      return renderReadOnlyField(fieldId, "档位", selectedNode.business.档位);
    }

    if (
      fieldId === "carlineDml" &&
      isLineLikeNode(selectedNode) &&
      selectedNode.business.type === "车线"
    ) {
      return renderReadOnlyField(fieldId, "DML", selectedNode.business.DML);
    }

    if (
      fieldId === "carlineIsEven" &&
      isLineLikeNode(selectedNode) &&
      selectedNode.business.type === "车线"
    ) {
      return renderToggleField(
        fieldId,
        "单双",
        selectedNode.business.是双数 ? "double" : "single",
        [
          {
            value: "single",
            label: "单",
            onClick: () =>
              updateCarlineFields(selectedNode.id, {
                是双数: false,
              }),
          },
          {
            value: "double",
            label: "双",
            onClick: () =>
              updateCarlineFields(selectedNode.id, {
                是双数: true,
              }),
          },
        ],
      );
    }

    if (
      fieldId === "carlineAnnotationNodeIds" &&
      isLineLikeNode(selectedNode) &&
      selectedNode.business.type === "车线"
    ) {
      return (
        <details className="inspectorFold" key={fieldId}>
          <summary className="inspectorFoldSummary">标注NodeId</summary>
          <div className="inspectorFoldBody">
            {renderReadOnlyField(
              `${fieldId}-carline-code`,
              "车线编号",
              selectedNode.business.标注NodeId.车线编号,
            )}
            {renderReadOnlyField(
              `${fieldId}-gear`,
              "档位",
              selectedNode.business.标注NodeId.档位,
            )}
            {renderReadOnlyField(
              `${fieldId}-odd-even`,
              "单双",
              selectedNode.business.标注NodeId.单双,
            )}
            {renderReadOnlyField(
              `${fieldId}-dml`,
              "DML",
              selectedNode.business.标注NodeId.DML,
            )}
          </div>
        </details>
      );
    }

    if (
      fieldId === "annotationField" &&
      selectedNode.business.type === "标注"
    ) {
      const annotationBusiness = selectedNode.business as Extract<
        NodeBusiness,
        { type: "标注" }
      >;
      return (
        <div className="row" key={fieldId}>
          <div className="label">字段</div>
          <select
            className="input"
            value={annotationBusiness.字段}
            disabled
            onChange={(e) => {
              const nextBusiness = {
                ...annotationBusiness,
                字段: e.currentTarget.value as AnnotationField,
              } satisfies Extract<NodeBusiness, { type: "标注" }>;
              const nextNodeId = shouldRegenerateNodeIdOnBusinessChange(
                selectedNode,
                nextBusiness,
              )
                ? createNodeIdForBusiness(
                    selectedNode.fabricObject.type,
                    nextBusiness,
                  )
                : undefined;
              setBusiness(
                selectedNode.id,
                nextBusiness,
                "更新标注字段",
                nextNodeId,
              );
            }}
          >
            {ANNOTATION_FIELD_OPTIONS.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (
      fieldId === "annotationCarlineId" &&
      selectedNode.business.type === "标注"
    ) {
      const annotationBusiness = selectedNode.business as Extract<
        NodeBusiness,
        { type: "标注" }
      >;
      return renderReadOnlyField(fieldId, "归属车线ID", annotationBusiness.归属车线Id);
    }

    return null;
  };

  return (
    <div className="editorRoot">
      <div className="menubar">
        <MenuDropdown label="文件">
          <div className="viewTitle">导入</div>

          <label
            className="checkRow"
            style={{ position: "relative", cursor: "pointer" }}
          >
            导入 SVG
            <input
              type="file"
              accept="image/svg+xml,.svg"
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                cursor: "pointer",
              }}
              onChange={async (e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                setImportError("");
                try {
                  const svg = await file.text();
                  await stageRef.current?.importSvg(svg);
                } catch (err) {
                  setImportError(
                    err instanceof Error ? err.message : String(err),
                  );
                } finally {
                  input.value = "";
                }
              }}
            />
          </label>

          <div
            className="checkRow"
            role="button"
            onClick={() => window.alert("导入 CoreDraw：暂未支持")}
          >
            导入 CoreDraw
          </div>

          <div className="viewTitle" style={{ marginTop: 10 }}>
            导出
          </div>

          <div
            className="checkRow"
            role="button"
            onClick={() => {
              const svg = stageRef.current?.exportSvg() ?? "";
              if (!svg) return;
              downloadText("canvas.svg", svg, "image/svg+xml");
            }}
          >
            导出 SVG
          </div>

          <div
            className="checkRow"
            role="button"
            onClick={() => {
              const json = serializeDocument(editor.data.getState());
              downloadText("document.json", json, "application/json");
            }}
          >
            导出 JSON
          </div>

        </MenuDropdown>

        <MenuDropdown label="命令">
          <div className="viewTitle">操作</div>
          <div
            className="checkRow"
            role="button"
            onClick={() => editor.edit.undo()}
            style={{ opacity: history.past.length === 0 ? 0.4 : 1 }}
          >
            Undo
          </div>
          <div
            className="checkRow"
            role="button"
            onClick={() => editor.edit.redo()}
            style={{ opacity: history.future.length === 0 ? 0.4 : 1 }}
          >
            Redo
          </div>

          <div className="viewTitle" style={{ marginTop: 10 }}>
            选区操作
          </div>
          <div
            className="checkRow"
            role="button"
            onClick={() => {
              const DML_DOUBLE_TEXTS = new Set(["D", "M", "L", "双"]);
              const ids = document.scene.order.filter((id) => {
                const node = document.scene.nodes[id];
                if (!node) return false;
                if (node.business.type === "标注") return false;
                const fo = node.fabricObject;
                if (fo.type !== "text" && fo.type !== "textbox") return false;
                return typeof fo.text === "string" && DML_DOUBLE_TEXTS.has(fo.text);
              });
              editor.edit.act({ type: "SET_SELECTION", payload: { nodeIds: ids } });
            }}
          >
            选中所有DML双
          </div>

          <div className="viewTitle" style={{ marginTop: 10 }}>
            业务命令
          </div>
          {(
            [
              "extract-carline",
              "mark-gear",
              "mark-odd-even",
            ] as BusinessCommandId[]
          ).map((commandId) => {
            const command = BUSINESS_COMMAND_FLOWS[commandId];
            return (
              <div
                key={commandId}
                className="checkRow"
                role="button"
                onClick={() => openBusinessCommandDialog(commandId)}
              >
                {command.menuLabel}
              </div>
            );
          })}
        </MenuDropdown>

        <MenuDropdown label="视图">
          <div className="viewTitle">线条显示</div>
          <label className="checkRow">
            <input
              type="checkbox"
              checked={viewState.线条.非车线}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                setViewState((s) => ({
                  ...s,
                  线条: { ...s.线条, 非车线: checked },
                }));
              }}
            />
            非车线
          </label>
          <label className="checkRow">
            <input
              type="checkbox"
              checked={viewState.线条.车线}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                setViewState((s) => ({
                  ...s,
                  线条: { ...s.线条, 车线: checked },
                }));
              }}
            />
            车线
          </label>

          <div className="viewTitle" style={{ marginTop: 10 }}>
            标注文本显示
          </div>
          {(["车线编号", "区域", "档位", "单双", "DML"] as const).map((key) => (
            <label className="checkRow" key={key}>
              <input
                type="checkbox"
                checked={viewState.标注文本[key]}
                onChange={(e) => {
                  const checked = e.currentTarget.checked;
                  setViewState((s) => ({
                    ...s,
                    标注文本: { ...s.标注文本, [key]: checked },
                  }));
                }}
              />
              {key}
            </label>
          ))}
        </MenuDropdown>
      </div>

      <div className="workspace">
        <div className="toolOptions">
          <span>就绪</span>
          <span>当前工具：{activeToolId}</span>
          <span>选中：{selection.length}</span>

          <div className="toolOptionsRight">
            <span>
              画布：{document.canvas.width}×{document.canvas.height}
            </span>
          </div>
        </div>

        {importError ? (
          <div className="banner">导入失败：{importError}</div>
        ) : null}

        <div className="mainArea">
          <div
            className={toolbarCollapsed ? "toolbar" : "toolbar toolbarExpanded"}
          >
            <>
              <div className="toolGroup">
                <div className="toolGroupTitle">选择工具</div>
                {tools
                  .filter((t) => t.type === "选择工具")
                  .map((tool) => {
                    const active = tool.id === activeToolId;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        title={`${tool.name} (${tool.shortcut ?? ""})`}
                        className={active ? "toolBtn toolBtnActive" : "toolBtn"}
                        onClick={() =>
                          editor.edit.activateTool(tool.id as ToolId)
                        }
                      >
                        {iconForTool(tool.id as ToolId)}
                        <span className="toolBtnLabel">
                          {tool.toolbarName ?? tool.name}
                        </span>
                      </button>
                    );
                  })}
              </div>

              <div className="toolGroup" style={{ borderBottom: "none" }}>
                <div className="toolGroupTitle">绘图工具</div>
                {tools
                  .filter((t) => t.type === "绘图工具")
                  .map((tool) => {
                    const active = tool.id === activeToolId;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        title={`${tool.name} (${tool.shortcut ?? ""})`}
                        className={active ? "toolBtn toolBtnActive" : "toolBtn"}
                        onClick={() =>
                          editor.edit.activateTool(tool.id as ToolId)
                        }
                      >
                        {iconForTool(tool.id as ToolId)}
                        <span className="toolBtnLabel">
                          {tool.toolbarName ?? tool.name}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </>
          </div>

          <div className="canvasArea">
            <button
              type="button"
              className="edgeToggleBtn edgeToggleBtnLeft"
              style={{ left: -14 }}
              aria-label={toolbarCollapsed ? "展开工具栏" : "收起工具栏"}
              onClick={() => setToolbarCollapsed((v) => !v)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d={toolbarCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              type="button"
              className="edgeToggleBtn edgeToggleBtnRight"
              style={{ right: rightCollapsed ? 8 : -14 }}
              aria-label={rightCollapsed ? "展开属性栏" : "收起属性栏"}
              onClick={() => setRightCollapsed((v) => !v)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d={rightCollapsed ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div className="paper">
              <FabricStage
                ref={stageRef}
                editor={editor}
                document={document}
                selection={selection}
                activeToolId={activeToolId}
                viewState={viewState}
                businessCommandActive={
                  isExtractCarlineHostOpen || isMarkGearHostOpen || isMarkOddEvenHostOpen
                }
              />
              <BusinessCommandHost
                open={isExtractCarlineHostOpen || isMarkGearHostOpen || isMarkOddEvenHostOpen}
                kind={
                  isExtractCarlineHostOpen
                    ? "extract-carline"
                    : isMarkGearHostOpen
                      ? "mark-gear"
                      : isMarkOddEvenHostOpen
                        ? "mark-odd-even"
                        : null
                }
                document={document}
                svgMarkup={businessCommandSvgMarkup}
                onClose={() => setActiveBusinessCommandId(null)}
                onCommit={(nextDocument) => {
                  editor.data.setState(nextDocument);
                  setActiveBusinessCommandId(null);
                }}
              />
            </div>
          </div>

          <div
            className={
              rightCollapsed ? "rightPanel rightPanelCollapsed" : "rightPanel"
            }
            style={rightCollapsed ? undefined : { width: rightWidth }}
          >
            {!rightCollapsed ? (
              <>
                <div className="resizeHandle" onMouseDown={onResizeMouseDown} />

                <div className="tabsHeader">
                  <div
                    className={
                      rightTab === "inspector"
                        ? "tabBtn tabBtnActive"
                        : "tabBtn"
                    }
                    onClick={() => setRightTab("inspector")}
                  >
                    属性
                  </div>
                  <div
                    className={
                      rightTab === "rules" ? "tabBtn tabBtnActive" : "tabBtn"
                    }
                    onClick={() => setRightTab("rules")}
                  >
                    全局规则栈
                  </div>
                </div>

                <div
                  className={
                    rightTab === "inspector"
                      ? "tabContent tabContentActive"
                      : "tabContent"
                  }
                >
                  <div
                    className="section"
                    style={{ flex: 1, borderBottom: "none" }}
                  >
                    <div className="sectionHeader">属性 (Inspector)</div>
                    <div className="sectionBody">
                      {!selectedNode ? (
                        <div
                          className="muted"
                          style={{ textAlign: "center", padding: "18px 0" }}
                        >
                          请在画布中选择对象
                        </div>
                      ) : (
                        <div className="form">
                          {inspectorSections.map((section, sectionIndex) => (
                            <div
                              key={section.id}
                              style={
                                sectionIndex === 0
                                  ? undefined
                                  : { marginTop: 10 }
                              }
                            >
                              <div className="sectionHeader">
                                {section.title}
                              </div>
                              {section.fields.map((fieldId) =>
                                renderInspectorField(fieldId),
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className={
                    rightTab === "rules"
                      ? "tabContent tabContentActive"
                      : "tabContent"
                  }
                >
                  {/* 规则列表（可滚动） */}
                  <div style={{ flex: 1, overflow: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="sectionHeader" style={{ margin: "-10px -10px 8px", borderRadius: 0 }}>
                      <span>程序化标注 (Modifiers)</span>
                    </div>

                    {document.domain.自动修改器.map((m, idx) => {
                        const id = m.id ?? `idx-${idx}`;
                        const isArea = m.type === "按区域自动标注DML";

                        return (
                          <div key={id} className="modifierCard">
                            {/* 卡片头 */}
                            <div className="modifierCardHeader">
                              <span className="modifierCardTag">{isArea ? "区域" : "档位"}</span>
                              <input
                                className="modifierCardRulesInput"
                                placeholder="规律，如 DML"
                                value={m.规律.join("")}
                                onChange={(e) => {
                                  const raw = e.currentTarget.value;
                                  // 只允许 D M L 大小写
                                  const filtered = raw.replace(/[^DMLdml]/g, "").toUpperCase();
                                  patchModifier(id, (mod) => ({
                                    ...mod,
                                    规律: filtered.split("").filter(Boolean),
                                  }));
                                  e.currentTarget.value = filtered;
                                }}
                              />
                              <button
                                type="button"
                                className="modifierCardDeleteBtn"
                                title="删除"
                                onClick={() => deleteModifier(id)}
                              >×</button>
                            </div>

                            <div className="modifierCardBody">
                              {/* 范围列表 */}
                                {isArea
                                  ? (m as Extract<typeof m, { type: "按区域自动标注DML" }>).范围.map(
                                      (r, rIdx) => (
                                        <div key={rIdx} className="modifierRangeRow">
                                          <input
                                            className="input"
                                            style={{ flex: 2 }}
                                            placeholder="区域名"
                                            value={r.区域}
                                            onChange={(e) =>
                                              patchModifier(id, (mod) => {
                                                if (mod.type !== "按区域自动标注DML") return mod;
                                                return {
                                                  ...mod,
                                                  范围: mod.范围.map((item, i) =>
                                                    i === rIdx ? { ...item, 区域: e.currentTarget.value } : item,
                                                  ),
                                                };
                                              })
                                            }
                                          />
                                          <input
                                            className="input"
                                            type="number"
                                            style={{ flex: 1 }}
                                            value={r.开始}
                                            onChange={(e) =>
                                              patchModifier(id, (mod) => {
                                                if (mod.type !== "按区域自动标注DML") return mod;
                                                return {
                                                  ...mod,
                                                  范围: mod.范围.map((item, i) =>
                                                    i === rIdx ? { ...item, 开始: Number(e.currentTarget.value) } : item,
                                                  ),
                                                };
                                              })
                                            }
                                          />
                                          <span className="modifierRangeSep">–</span>
                                          <input
                                            className="input"
                                            type="number"
                                            style={{ flex: 1 }}
                                            value={r.结束}
                                            onChange={(e) =>
                                              patchModifier(id, (mod) => {
                                                if (mod.type !== "按区域自动标注DML") return mod;
                                                return {
                                                  ...mod,
                                                  范围: mod.范围.map((item, i) =>
                                                    i === rIdx ? { ...item, 结束: Number(e.currentTarget.value) } : item,
                                                  ),
                                                };
                                              })
                                            }
                                          />
                                          <button
                                            type="button"
                                            className="modifierRangeDeleteBtn"
                                            onClick={() =>
                                              patchModifier(id, (mod) => {
                                                if (mod.type !== "按区域自动标注DML") return mod;
                                                return { ...mod, 范围: mod.范围.filter((_, i) => i !== rIdx) };
                                              })
                                            }
                                          >×</button>
                                        </div>
                                      ),
                                    )
                                  : (m as Extract<typeof m, { type: "按档位自动标注DML" }>).范围.map(
                                      (r, rIdx) => (
                                        <div key={rIdx} className="modifierRangeRow">
                                          <input
                                            className="input"
                                            style={{ flex: 2 }}
                                            placeholder="档位名"
                                            value={r.档位}
                                            onChange={(e) =>
                                              patchModifier(id, (mod) => {
                                                if (mod.type !== "按档位自动标注DML") return mod;
                                                return {
                                                  ...mod,
                                                  范围: mod.范围.map((item, i) =>
                                                    i === rIdx ? { ...item, 档位: e.currentTarget.value } : item,
                                                  ),
                                                };
                                              })
                                            }
                                          />
                                          <input
                                            className="input"
                                            type="number"
                                            style={{ flex: 1 }}
                                            value={r.开始}
                                            onChange={(e) =>
                                              patchModifier(id, (mod) => {
                                                if (mod.type !== "按档位自动标注DML") return mod;
                                                return {
                                                  ...mod,
                                                  范围: mod.范围.map((item, i) =>
                                                    i === rIdx ? { ...item, 开始: Number(e.currentTarget.value) } : item,
                                                  ),
                                                };
                                              })
                                            }
                                          />
                                          <span className="modifierRangeSep">–</span>
                                          <input
                                            className="input"
                                            type="number"
                                            style={{ flex: 1 }}
                                            value={r.结束}
                                            onChange={(e) =>
                                              patchModifier(id, (mod) => {
                                                if (mod.type !== "按档位自动标注DML") return mod;
                                                return {
                                                  ...mod,
                                                  范围: mod.范围.map((item, i) =>
                                                    i === rIdx ? { ...item, 结束: Number(e.currentTarget.value) } : item,
                                                  ),
                                                };
                                              })
                                            }
                                          />
                                          <button
                                            type="button"
                                            className="modifierRangeDeleteBtn"
                                            onClick={() =>
                                              patchModifier(id, (mod) => {
                                                if (mod.type !== "按档位自动标注DML") return mod;
                                                return { ...mod, 范围: mod.范围.filter((_, i) => i !== rIdx) };
                                              })
                                            }
                                          >×</button>
                                        </div>
                                      ),
                                    )}

                                <button
                                  type="button"
                                  className="modifierAddRangeBtn"
                                  onClick={() =>
                                    patchModifier(id, (mod) => {
                                      if (mod.type === "按区域自动标注DML") {
                                        return { ...mod, 范围: [...mod.范围, { 区域: "", 开始: 0, 结束: 100 }] };
                                      }
                                      return { ...mod, 范围: [...mod.范围, { 档位: "", 开始: 0, 结束: 100 }] };
                                    })
                                  }
                                >
                                  + 添加范围
                                </button>
                              </div>
                            </div>
                        );
                      })}

                    {/* 添加规则行（在列表内，随列表滚动） */}
                    <div className="modifierAddRow">
                      <select
                        className="input"
                        style={{ flex: 1, fontSize: 12 }}
                        value={newModifierType}
                        onChange={(e) => setNewModifierType(e.currentTarget.value as typeof newModifierType)}
                      >
                        <option value="按区域自动标注DML">按区域标注DML</option>
                        <option value="按档位自动标注DML">按档位标注DML</option>
                      </select>
                      <button
                        type="button"
                        className="btn btnPrimary"
                        style={{ flexShrink: 0 }}
                        onClick={addModifier}
                      >
                        + 添加
                      </button>
                    </div>
                  </div>

                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="footer">
        <div>
          文档：{document.meta.name} · v{document.meta.version}
        </div>
        <div>选中：{selection.length}</div>
      </footer>

      <BusinessCommandDialog
        open={Boolean(activeLegacyBusinessFlow)}
        title={activeLegacyBusinessFlow?.title ?? ""}
        summary={activeLegacyBusinessFlow?.summary}
        steps={activeLegacyBusinessFlow?.steps ?? []}
        currentStep={businessCommandStepIndex}
        showExitConfirm={showBusinessCommandExitConfirm}
        onPrev={goToPreviousBusinessCommandStep}
        onNext={goToNextBusinessCommandStep}
        onFinish={finishBusinessCommandDialog}
        onRequestClose={requestCloseBusinessCommandDialog}
        onCancelExit={cancelCloseBusinessCommandDialog}
        onConfirmExit={confirmCloseBusinessCommandDialog}
      />
    </div>
  );
}
