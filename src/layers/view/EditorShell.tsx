import { useEffect, useMemo, useRef, useState } from 'react';
import { MenuDropdown } from '../../components/MenuDropdown';
import { useDocumentState, useEditState, useEditor } from '../../app/EditorContext';
import type { AnnotationField, AutoModifierConfig, NodeBusiness, NodeId } from '../data/types';
import { serializeDocument } from '../data/serialization';
import { createCommand, createRectNode, createTextboxNode } from '../edit/commands';
import type { ToolId } from '../edit/tools';
import { FabricStage, type FabricStageApi } from './FabricStage';
import { DEFAULT_VIEW_STATE, type ViewState } from './viewState';

function downloadText(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
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

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onMouseDown = () => {
    draggingRef.current = true;
  };

  return { width, onMouseDown };
}

function iconForTool(toolId: ToolId) {
  switch (toolId) {
    case 'select-box':
    case 'select-controls':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 2l12 11.2-5.8.5 3.3 7.3-2.2.9-3.2-7.4-4.4 4.7z" />
        </svg>
      );
    case 'select-lasso':
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
    case 'draw-path':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 21c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm14-16c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zM6.6 19.8l10.8-13.6c.4-.5 1.2-.6 1.7-.2.5.4.6 1.2.2 1.7L8.5 21.3c-.4.5-1.2.6-1.7.2-.5-.4-.6-1.2-.2-1.7z" />
        </svg>
      );
    case 'draw-text':
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

  const [importError, setImportError] = useState<string>('');
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);

  const [rightTab, setRightTab] = useState<'inspector' | 'rules'>('inspector');

  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [toolbarLarge, setToolbarLarge] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const { width: rightWidth, onMouseDown: onResizeMouseDown } =
    useResizableRightPanel(380);

  const activeToolId = editState.activeToolId;
  const tools = editState.tools;
  const selection = editState.selection;
  const history = editor.edit.getHistory();

  const selectedNode = useMemo(() => {
    const id = selection[0];
    return id ? document.scene.nodes[id] : null;
  }, [document.scene.nodes, selection]);

  const patchGraphic = (
    nodeId: NodeId,
    patch: Record<string, unknown>,
    label: string,
  ) => {
    editor.edit.execute(createCommand('更新图形属性', { nodeId, patch }), label);
  };

  const setBusiness = (nodeId: NodeId, business: NodeBusiness, label: string) => {
    editor.edit.execute(createCommand('设置业务属性', { nodeId, business }), label);
  };

  const updateCarlineFields = (
    nodeId: NodeId,
    payload: { 尺数?: number; 是双数?: boolean },
  ) => {
    editor.edit.execute(createCommand('更新车线字段', { nodeId, ...payload }), '更新车线字段');
  };

  const setAutoModifiers = (mods: AutoModifierConfig[]) => {
    editor.edit.execute(createCommand('设置自动修改器', { autoModifiers: mods }), '设置自动修改器');
  };

  const addModifier = () => {
    const next: AutoModifierConfig = {
      id: crypto.randomUUID(),
      type: '按区域自动标注DML',
      启用: true,
      规律: ['D', 'M', 'L'],
      范围: [{ 区域: 'A', 开始: 1, 结束: 10 }],
    };
    setAutoModifiers([...document.domain.自动修改器, next]);
  };

  const deleteModifier = (id: string) => {
    setAutoModifiers(document.domain.自动修改器.filter((m) => m.id !== id));
  };

  const moveModifier = (id: string, direction: -1 | 1) => {
    const idx = document.domain.自动修改器.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const next = document.domain.自动修改器.slice();
    const target = idx + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setAutoModifiers(next);
  };

  const toggleModifierEnabled = (id: string) => {
    setAutoModifiers(
      document.domain.自动修改器.map((m) => (m.id === id ? { ...m, 启用: !m.启用 } : m)),
    );
  };


  const commandNotImplemented = (name: string) => {
    window.alert(`${name}：骨架中已预留入口，业务逻辑待接入`);
  };

  return (
    <div className="editorRoot">
      <div className="menubar">
        <MenuDropdown label="文件">
          <div className="viewTitle">导入</div>

          <label className="checkRow" style={{ position: 'relative', cursor: 'pointer' }}>
            导入 SVG
            <input
              type="file"
              accept="image/svg+xml,.svg"
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              onChange={async (e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                setImportError('');
                try {
                  const svg = await file.text();
                  await stageRef.current?.importSvg(svg);
                } catch (err) {
                  setImportError(err instanceof Error ? err.message : String(err));
                } finally {
                  input.value = '';
                }
              }}
            />
          </label>

          <label className="checkRow" style={{ position: 'relative', cursor: 'pointer' }}>
            导入 CoreDraw
            <input
              type="file"
              accept=".cdr"
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                commandNotImplemented(`导入 CoreDraw（${file.name}）`);
                e.currentTarget.value = '';
              }}
            />
          </label>

          <div className="viewTitle" style={{ marginTop: 10 }}>
            导出
          </div>

          <div
            className="checkRow"
            role="button"
            onClick={() => {
              const svg = stageRef.current?.exportSvg() ?? '';
              if (!svg) return;
              downloadText('canvas.svg', svg, 'image/svg+xml');
            }}
          >
            导出 SVG
          </div>

          <div
            className="checkRow"
            role="button"
            onClick={() => {
              const json = serializeDocument(editor.data.getState());
              downloadText('document.json', json, 'application/json');
            }}
          >
            导出 JSON
          </div>

          <div
            className="checkRow"
            role="button"
            onClick={() => commandNotImplemented('导出生产图纸')}
          >
            导出生产图纸
          </div>
        </MenuDropdown>

        <MenuDropdown label="编辑">
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
            文档
          </div>
          <div
            className="checkRow"
            role="button"
            onClick={() =>
              editor.edit.execute(
                createCommand('新增节点', { node: createRectNode() }),
                '新增矩形',
              )
            }
          >
            新增矩形
          </div>
          <div
            className="checkRow"
            role="button"
            onClick={() =>
              editor.edit.execute(
                createCommand('新增节点', { node: createTextboxNode() }),
                '新增文本',
              )
            }
          >
            新增文本
          </div>
          <div
            className="checkRow"
            role="button"
            onClick={() =>
              editor.edit.execute(
                createCommand('删除节点', { nodeIds: selection }),
                '删除',
              )
            }
            style={{ opacity: selection.length === 0 ? 0.4 : 1 }}
          >
            删除选中
          </div>
        </MenuDropdown>

        <MenuDropdown label="视图">
          <div className="viewTitle">元素显示</div>
          <label className="checkRow">
            <input
              type="checkbox"
              checked={viewState.元素.未标记}
              onChange={(e) =>
                setViewState((s) => ({
                  ...s,
                  元素: { ...s.元素, 未标记: e.currentTarget.checked },
                }))
              }
            />
            未标记
          </label>
          <label className="checkRow">
            <input
              type="checkbox"
              checked={viewState.元素.车线}
              onChange={(e) =>
                setViewState((s) => ({
                  ...s,
                  元素: { ...s.元素, 车线: e.currentTarget.checked },
                }))
              }
            />
            车线
          </label>

          <div className="viewTitle" style={{ marginTop: 10 }}>
            标注显示
          </div>
          {(['车线编号', '区域', '档位', '单双', 'DML'] as const).map((key) => (
            <label className="checkRow" key={key}>
              <input
                type="checkbox"
                checked={viewState.标注[key]}
                onChange={(e) =>
                  setViewState((s) => ({
                    ...s,
                    标注: { ...s.标注, [key]: e.currentTarget.checked },
                  }))
                }
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
            <div
              className="menuItem"
              role="button"
              tabIndex={0}
              title={toolbarLarge ? '切换为小图标工具栏' : '切换为放大工具栏（显示名称）'}
              onClick={() => setToolbarLarge((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setToolbarLarge((v) => !v);
              }}
            >
              工具栏：{toolbarLarge ? '放大' : '图标'}
            </div>

            <span>
              画布：{document.canvas.width}×{document.canvas.height}
            </span>
          </div>
        </div>

        {importError ? <div className="banner">导入失败：{importError}</div> : null}

        <div className="mainArea">
          <div
            className={
              toolbarCollapsed
                ? 'toolbar toolbarCollapsed'
                : toolbarLarge
                  ? 'toolbar toolbarLarge'
                  : 'toolbar'
            }
          >
            {!toolbarCollapsed ? (
              <>
                <div className="toolGroup">
                  {tools
                    .filter((t) => t.type === '选择工具')
                    .map((tool) => {
                      const active = tool.id === activeToolId;
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          title={`${tool.name} (${tool.shortcut ?? ''})`}
                          className={active ? 'toolBtn toolBtnActive' : 'toolBtn'}
                          onClick={() => editor.edit.activateTool(tool.id as ToolId)}
                        >
                          {iconForTool(tool.id as ToolId)}
                          <span className="toolBtnLabel">{tool.toolbarName ?? tool.name}</span>
                        </button>
                      );
                    })}
                </div>

                <div className="toolGroup" style={{ borderBottom: 'none' }}>
                  {tools
                    .filter((t) => t.type === '绘图工具')
                    .map((tool) => {
                      const active = tool.id === activeToolId;
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          title={`${tool.name} (${tool.shortcut ?? ''})`}
                          className={active ? 'toolBtn toolBtnActive' : 'toolBtn'}
                          onClick={() => editor.edit.activateTool(tool.id as ToolId)}
                        >
                          {iconForTool(tool.id as ToolId)}
                          <span className="toolBtnLabel">{tool.toolbarName ?? tool.name}</span>
                        </button>
                      );
                    })}
                </div>

              </>
            ) : null}
          </div>

          <div className="canvasArea">
            <button
              type="button"
              className="edgeToggleBtn edgeToggleBtnLeft"
              style={{ left: toolbarCollapsed ? 8 : -14 }}
              aria-label={toolbarCollapsed ? '展开工具栏' : '收起工具栏'}
              onClick={() => setToolbarCollapsed((v) => !v)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d={toolbarCollapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'}
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
              aria-label={rightCollapsed ? '展开属性栏' : '收起属性栏'}
              onClick={() => setRightCollapsed((v) => !v)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d={rightCollapsed ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
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
              />
            </div>
          </div>

          <div
            className={rightCollapsed ? 'rightPanel rightPanelCollapsed' : 'rightPanel'}
            style={rightCollapsed ? undefined : { width: rightWidth }}
          >
            {!rightCollapsed ? (
              <>
                <div className="resizeHandle" onMouseDown={onResizeMouseDown} />

                <div className="tabsHeader">
                  <div
                    className={rightTab === 'inspector' ? 'tabBtn tabBtnActive' : 'tabBtn'}
                    onClick={() => setRightTab('inspector')}
                  >
                    属性
                  </div>
                  <div
                    className={rightTab === 'rules' ? 'tabBtn tabBtnActive' : 'tabBtn'}
                    onClick={() => setRightTab('rules')}
                  >
                    全局规则栈
                  </div>
                </div>

                <div
                  className={rightTab === 'inspector' ? 'tabContent tabContentActive' : 'tabContent'}
                >
                  <div className="section" style={{ flex: 1, borderBottom: 'none' }}>
                    <div className="sectionHeader">属性 (Inspector)</div>
                    <div className="sectionBody">
                      {!selectedNode ? (
                        <div className="muted" style={{ textAlign: 'center', padding: '18px 0' }}>
                          请在画布中选择对象
                        </div>
                      ) : (
                        <div className="form">
                          <div className="row">
                            <div className="label">ID</div>
                            <input className="input" value={selectedNode.id} readOnly />
                          </div>

                          <div className="row">
                            <div className="label">X</div>
                            <input
                              className="input"
                              type="number"
                              value={Math.round(selectedNode.graphic.props.left)}
                              onChange={(e) =>
                                patchGraphic(selectedNode.id, { left: Number(e.currentTarget.value) }, '更新X')
                              }
                            />
                          </div>

                          <div className="row">
                            <div className="label">Y</div>
                            <input
                              className="input"
                              type="number"
                              value={Math.round(selectedNode.graphic.props.top)}
                              onChange={(e) =>
                                patchGraphic(selectedNode.id, { top: Number(e.currentTarget.value) }, '更新Y')
                              }
                            />
                          </div>

                          {selectedNode.graphic.fabricType === 'rect' ? (
                            <>
                              <div className="row">
                                <div className="label">填充</div>
                                <input
                                  className="input"
                                  value={selectedNode.graphic.props.fill}
                                  onChange={(e) =>
                                    patchGraphic(selectedNode.id, { fill: e.currentTarget.value }, '更新填充')
                                  }
                                />
                              </div>
                              <div className="row">
                                <div className="label">描边</div>
                                <input
                                  className="input"
                                  value={selectedNode.graphic.props.stroke}
                                  onChange={(e) =>
                                    patchGraphic(selectedNode.id, { stroke: e.currentTarget.value }, '更新描边')
                                  }
                                />
                              </div>
                            </>
                          ) : null}

                          {selectedNode.graphic.fabricType === 'textbox' ? (
                            <>
                              <div className="row">
                                <div className="label">文本</div>
                                <textarea
                                  className="input"
                                  value={selectedNode.graphic.props.text}
                                  rows={3}
                                  onChange={(e) =>
                                    patchGraphic(selectedNode.id, { text: e.currentTarget.value }, '更新文本')
                                  }
                                />
                              </div>
                              <div className="row">
                                <div className="label">字号</div>
                                <input
                                  className="input"
                                  type="number"
                                  value={selectedNode.graphic.props.fontSize}
                                  onChange={(e) =>
                                    patchGraphic(selectedNode.id, { fontSize: Number(e.currentTarget.value) }, '更新字号')
                                  }
                                />
                              </div>
                            </>
                          ) : null}

                          <div className="row" style={{ marginTop: 10 }}>
                            <div className="label">业务类型</div>
                            <select
                              className="input"
                              value={selectedNode.business.type}
                              onChange={(e) => {
                                const nextType = e.currentTarget.value as NodeBusiness['type'];
                                if (nextType === '未标记') {
                                  setBusiness(selectedNode.id, { type: '未标记' }, '设为未标记');
                                  return;
                                }
                                if (nextType === '车线') {
                                  setBusiness(
                                    selectedNode.id,
                                    {
                                      type: '车线',
                                      id: crypto.randomUUID(),
                                      编号: 1,
                                      区域: 'A',
                                      区域编号: 'A01',
                                      尺数: 10,
                                      档位: '1',
                                      DML: 'M',
                                      是双数: false,
                                      标注NodeId: {
                                        区域编号: crypto.randomUUID(),
                                        档位: crypto.randomUUID(),
                                        单双: crypto.randomUUID(),
                                        DML: crypto.randomUUID(),
                                      },
                                    },
                                    '设为车线',
                                  );
                                  return;
                                }
                                if (nextType === '标注') {
                                  setBusiness(
                                    selectedNode.id,
                                    { type: '标注', 字段: '区域', 归属车线Id: 'carline' },
                                    '设为标注',
                                  );
                                }
                              }}
                            >
                              <option value="未标记">未标记</option>
                              <option value="车线">车线</option>
                              <option value="标注">标注</option>
                            </select>
                          </div>

                          {selectedNode.business.type === '标注' ? (
                            <div className="row">
                              <div className="label">字段</div>
                              <select
                                className="input"
                                value={selectedNode.business.字段}
                                onChange={(e) => {
                                  const current = selectedNode.business as Extract<
                                    NodeBusiness,
                                    { type: '标注' }
                                  >;
                                  setBusiness(
                                    selectedNode.id,
                                    { ...current, 字段: e.currentTarget.value as AnnotationField },
                                    '更新标注字段',
                                  );
                                }}
                              >
                                {(['车线编号', '区域', '档位', '单双', 'DML'] as const).map((f) => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}

                          {selectedNode.business.type === '车线' ? (
                            <>
                              <div className="row">
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
                              <label className="checkRow" style={{ marginTop: 4 }}>
                                <input
                                  type="checkbox"
                                  checked={selectedNode.business.是双数}
                                  onChange={(e) =>
                                    updateCarlineFields(selectedNode.id, {
                                      是双数: e.currentTarget.checked,
                                    })
                                  }
                                />
                                是双数
                              </label>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={rightTab === 'rules' ? 'tabContent tabContentActive' : 'tabContent'}>
                  <div className="section" style={{ flex: 1, overflow: 'hidden', borderBottom: 'none' }}>
                    <div className="sectionHeader">
                      <span>程序化标注 (Modifiers)</span>
                      <span
                        className="menuItem"
                        style={{ color: 'var(--accent)' }}
                        onClick={() => setAutoModifiers([])}
                      >
                        清空
                      </span>
                    </div>
                    <div className="sectionBody">
                      <button type="button" className="btn btnPrimary" onClick={addModifier}>
                        + 添加规则
                      </button>

                      {document.domain.自动修改器.length === 0 ? (
                        <div className="muted" style={{ marginTop: 10 }}>
                          暂无规则
                        </div>
                      ) : (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {document.domain.自动修改器.map((m, idx) => {
                            const id = m.id ?? `idx-${idx}`;
                            const enabled = m.启用 ?? true;
                            return (
                            <div
                              key={id}
                              style={{
                                border: '1px solid var(--border)',
                                borderRadius: 12,
                                padding: 10,
                                background: '#fff',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                  alignItems: 'flex-start',
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 800 }}>{m.type}</div>
                                  <div className="muted">{id.slice(0, 8)}</div>
                                </div>
                                <label className="checkRow">
                                  <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={() => toggleModifierEnabled(id)}
                                  />
                                  启用
                                </label>
                              </div>
                              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                                <button type="button" className="btn" onClick={() => moveModifier(id, -1)}>
                                  上移
                                </button>
                                <button type="button" className="btn" onClick={() => moveModifier(id, 1)}>
                                  下移
                                </button>
                                <button type="button" className="btn btnDanger" onClick={() => deleteModifier(id)}>
                                  删除
                                </button>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
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
    </div>
  );
}
