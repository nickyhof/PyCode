import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { useApp } from '../../context/AppContext';
import { runCell, syncFilesToWorker } from '../../services/pyodide';
import { Editor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
loader.config({ monaco });

// ─── Types ───────────────────────────────────────────────

interface NotebookCell {
  id: string;
  cell_type: 'code' | 'markdown';
  source: string;
  outputs: CellOutput[];
  execution_count: number | null;
  running: boolean;
}

interface CellOutput {
  output_type: 'stdout' | 'stderr' | 'execute_result' | 'display_data';
  text: string;
  imageData?: string;  // base64 data URI for plots
}

interface NotebookEditorProps {
  filePath: string;
}

// ─── Notebook Monaco theme ───────────────────────────────

monaco.editor.defineTheme('pycode-notebook', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8b949e' },
    { token: 'keyword', foreground: 'ff7b72' },
    { token: 'string', foreground: 'a5d6ff' },
    { token: 'number', foreground: '79c0ff' },
    { token: 'type', foreground: 'ffa657' },
    { token: 'identifier', foreground: 'e6edf3' },
    { token: 'delimiter', foreground: 'c9d1d9' },
    { token: 'variable', foreground: 'e6edf3' },
  ],
  colors: {
    'editor.background': '#2d333b',
    'editor.foreground': '#e6edf3',
    'editorCursor.foreground': '#79c0ff',
    'editor.lineHighlightBackground': '#343b45',
    'editor.selectionBackground': '#3a4a5c',
    'editorLineNumber.foreground': '#636e7b',
  },
});

// ─── Helpers ─────────────────────────────────────────────

let cellCounter = 0;
function newCellId(): string {
  return `cell-${Date.now()}-${cellCounter++}`;
}

// Store original notebook data for perfect round-tripping
let savedNotebookMeta: Record<string, unknown> = {};
let savedIndent: number = 1;
const savedRawCells = new Map<string, Record<string, unknown>>();

function detectIndent(json: string): number {
  const match = json.match(/\n(\s+)"/);
  return match ? match[1].length : 1;
}

function sourceToArray(source: string): string[] {
  return source.split('\n').map((line, i, arr) =>
    i < arr.length - 1 ? line + '\n' : line
  );
}

function parseNotebook(json: string): NotebookCell[] {
  try {
    const nb = JSON.parse(json);
    const { cells: _cells, ...meta } = nb;
    savedNotebookMeta = meta;
    savedIndent = detectIndent(json);
    savedRawCells.clear();
    if (!nb.cells || !Array.isArray(nb.cells)) return [makeCell('code')];
    return nb.cells.map((c: Record<string, unknown>) => {
      const id = newCellId();
      savedRawCells.set(id, { ...c });
      return {
        id,
        cell_type: c.cell_type === 'markdown' ? 'markdown' : 'code',
        source: Array.isArray(c.source) ? (c.source as string[]).join('') : String(c.source || ''),
        outputs: parseOutputs(c.outputs as Record<string, unknown>[] | undefined),
        execution_count: (c.execution_count as number) || null,
        running: false,
      };
    });
  } catch {
    return [makeCell('code')];
  }
}

function parseOutputs(outputs?: Record<string, unknown>[]): CellOutput[] {
  if (!outputs || !Array.isArray(outputs)) return [];
  return outputs.map((o) => {
    const text = o.text
      ? (Array.isArray(o.text) ? (o.text as string[]).join('') : String(o.text))
      : '';
    // Check for image data in display_data outputs
    let imageData: string | undefined;
    if (o.output_type === 'display_data' && o.data && typeof o.data === 'object') {
      const mimeData = o.data as Record<string, unknown>;
      if (mimeData['image/png']) {
        const b64 = Array.isArray(mimeData['image/png'])
          ? (mimeData['image/png'] as string[]).join('')
          : String(mimeData['image/png']);
        imageData = `data:image/png;base64,${b64}`;
      }
    }
    return {
      output_type: (o.output_type as CellOutput['output_type']) || 'stdout',
      text,
      imageData,
    };
  });
}

function makeCell(type: 'code' | 'markdown'): NotebookCell {
  return {
    id: newCellId(),
    cell_type: type,
    source: '',
    outputs: [],
    execution_count: null,
    running: false,
  };
}

function serializeNotebook(cells: NotebookCell[]): string {
  const defaultMeta = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3 (Pyodide)', language: 'python', name: 'python3' },
      language_info: { name: 'python', version: '3.12' },
    },
  };
  const meta = Object.keys(savedNotebookMeta).length > 0 ? savedNotebookMeta : defaultMeta;
  const nb = {
    ...meta,
    cells: cells.map((c) => {
      const raw = savedRawCells.get(c.id);
      if (raw) {
        // Merge changes back into original raw cell — preserves key order and metadata
        const merged: Record<string, unknown> = { ...raw };
        merged.cell_type = c.cell_type;
        merged.source = sourceToArray(c.source);
        if (c.cell_type === 'code') {
          merged.execution_count = c.execution_count;
          merged.outputs = c.outputs.length > 0
            ? c.outputs.map((o) => {
                if (o.imageData) {
                  // Serialize as display_data with image/png MIME
                  const b64 = o.imageData.replace('data:image/png;base64,', '');
                  return {
                    output_type: 'display_data',
                    data: { 'image/png': b64, 'text/plain': ['<Figure>'] },
                    metadata: {},
                  };
                }
                return {
                  output_type: 'stream',
                  name: o.output_type === 'stderr' ? 'stderr' : 'stdout',
                  text: o.text.split('\n').map((line, i, arr) =>
                    i < arr.length - 1 ? line + '\n' : line
                  ),
                };
              })
            : [];
        }
        return merged;
      }
      // New cell
      const newCell: Record<string, unknown> = {
        cell_type: c.cell_type,
        metadata: {},
        source: sourceToArray(c.source),
      };
      if (c.cell_type === 'code') {
        newCell.execution_count = c.execution_count;
        newCell.outputs = c.outputs.map((o) => {
          if (o.imageData) {
            const b64 = o.imageData.replace('data:image/png;base64,', '');
            return {
              output_type: 'display_data',
              data: { 'image/png': b64, 'text/plain': ['<Figure>'] },
              metadata: {},
            };
          }
          return {
            output_type: 'stream',
            name: o.output_type === 'stderr' ? 'stderr' : 'stdout',
            text: o.text.split('\n').map((line, i, arr) =>
              i < arr.length - 1 ? line + '\n' : line
            ),
          };
        });
      }
      return newCell;
    }),
  };
  return JSON.stringify(nb, null, savedIndent) + '\n';
}

// ─── Simple Markdown Renderer ────────────────────────────

function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold & Italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p>\s*<(h[1-3]|ul|pre)/g, '<$1');
  html = html.replace(/<\/(h[1-3]|ul|pre)>\s*<\/p>/g, '</$1>');

  return html;
}

// ─── Component ───────────────────────────────────────────

export function NotebookEditor({ filePath }: NotebookEditorProps) {
  const { vfs, dispatch, addWorkerListener, state } = useApp();
  const [cells, setCells] = useState<NotebookCell[]>(() => {
    const entry = vfs.get(filePath);
    return entry?.content ? parseNotebook(entry.content) : [makeCell('code')];
  });
  const [focusedCell, setFocusedCell] = useState<string | null>(null);
  const [editingMarkdown, setEditingMarkdown] = useState<string | null>(null);
  const [pendingInput, setPendingInput] = useState<{
    cellId: string;
    prompt: string;
    buffer: SharedArrayBuffer;
  } | null>(null);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const executionCounter = useRef(0);

  // Save to VFS on change
  const saveToVfs = useCallback(
    (updatedCells: NotebookCell[]) => {
      const json = serializeNotebook(updatedCells);
      vfs.set(filePath, json);
      dispatch({ type: 'MARK_DIRTY', path: filePath, dirty: true });
      dispatch({ type: 'VFS_CHANGED' });
    },
    [filePath, vfs, dispatch]
  );

  // Listen for cell output
  useEffect(() => {
    const remove = addWorkerListener((type, data, fullMsg) => {
      const cellId = fullMsg?.cellId as string | undefined;
      if (!cellId) return;

      if (type === 'cell-stdout' || type === 'cell-stderr') {
        setCells((prev) =>
          prev.map((c) =>
            c.id === cellId
              ? {
                  ...c,
                  outputs: [
                    ...c.outputs,
                    {
                      output_type: type === 'cell-stderr' ? 'stderr' as const : 'stdout' as const,
                      text: String(data || ''),
                    },
                  ],
                }
              : c
          )
        );
      } else if (type === 'cell-image') {
        // Plot image from matplotlib
        setCells((prev) =>
          prev.map((c) =>
            c.id === cellId
              ? {
                  ...c,
                  outputs: [
                    ...c.outputs,
                    {
                      output_type: 'display_data' as const,
                      text: '',
                      imageData: String(data || ''),
                    },
                  ],
                }
              : c
          )
        );
      } else if (type === 'cell-done') {
        setCells((prev) => {
          const updated = prev.map((c) =>
            c.id === cellId ? { ...c, running: false } : c
          );
          saveToVfs(updated);
          return updated;
        });
      } else if (type === 'input-request') {
        // Python called input() in a notebook cell
        const buffer = fullMsg?.buffer as SharedArrayBuffer | undefined;
        if (buffer && cellId) {
          setPendingInput({ cellId, prompt: String(data || ''), buffer });
        }
      }
    });
    return remove;
  }, [addWorkerListener, saveToVfs]);

  // Run a cell
  const handleRunCell = useCallback(
    (cellId: string) => {
      const cell = cellsRef.current.find((c) => c.id === cellId);
      if (!cell || cell.cell_type !== 'code' || !cell.source.trim()) return;
      if (!state.pyodideReady) return;

      executionCounter.current += 1;
      const execCount = executionCounter.current;

      setCells((prev) =>
        prev.map((c) =>
          c.id === cellId
            ? { ...c, outputs: [], running: true, execution_count: execCount }
            : c
        )
      );

      syncFilesToWorker(vfs.getAllFiles());
      runCell(cellId, cell.source);
    },
    [vfs, state.pyodideReady]
  );

  // Run all cells
  const handleRunAll = useCallback(() => {
    const codeCells = cells.filter((c) => c.cell_type === 'code');
    // Run sequentially using a chain
    let delay = 0;
    for (const cell of codeCells) {
      setTimeout(() => handleRunCell(cell.id), delay);
      delay += 100;
    }
  }, [cells, handleRunCell]);

  // Update cell source
  const updateCellSource = useCallback(
    (cellId: string, source: string) => {
      setCells((prev) => {
        const updated = prev.map((c) =>
          c.id === cellId ? { ...c, source } : c
        );
        saveToVfs(updated);
        return updated;
      });
    },
    [saveToVfs]
  );

  // Add cell
  const addCell = useCallback(
    (afterId: string, type: 'code' | 'markdown') => {
      setCells((prev) => {
        const idx = prev.findIndex((c) => c.id === afterId);
        const newCells = [...prev];
        const cell = makeCell(type);
        newCells.splice(idx + 1, 0, cell);
        saveToVfs(newCells);
        setFocusedCell(cell.id);
        return newCells;
      });
    },
    [saveToVfs]
  );

  // Delete cell
  const deleteCell = useCallback(
    (cellId: string) => {
      setCells((prev) => {
        if (prev.length <= 1) return prev;
        const updated = prev.filter((c) => c.id !== cellId);
        saveToVfs(updated);
        return updated;
      });
    },
    [saveToVfs]
  );

  // Clear cell output
  const clearCellOutput = useCallback(
    (cellId: string) => {
      setCells((prev) => {
        const updated = prev.map((c) =>
          c.id === cellId ? { ...c, outputs: [], execution_count: null } : c
        );
        saveToVfs(updated);
        return updated;
      });
    },
    [saveToVfs]
  );

  // Clear all cell outputs
  const clearAllOutputs = useCallback(() => {
    setCells((prev) => {
      const updated = prev.map((c) =>
        c.cell_type === 'code' ? { ...c, outputs: [], execution_count: null } : c
      );
      saveToVfs(updated);
      return updated;
    });
  }, [saveToVfs]);

  // Move cell
  const moveCell = useCallback(
    (cellId: string, dir: -1 | 1) => {
      setCells((prev) => {
        const idx = prev.findIndex((c) => c.id === cellId);
        if (idx < 0) return prev;
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= prev.length) return prev;
        const updated = [...prev];
        [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
        saveToVfs(updated);
        return updated;
      });
    },
    [saveToVfs]
  );

  // Toggle cell type
  const toggleCellType = useCallback(
    (cellId: string) => {
      setCells((prev) => {
        const updated = prev.map((c) =>
          c.id === cellId
            ? {
                ...c,
                cell_type: (c.cell_type === 'code' ? 'markdown' : 'code') as
                  | 'code'
                  | 'markdown',
                outputs: [],
                execution_count: null,
              }
            : c
        );
        saveToVfs(updated);
        return updated;
      });
    },
    [saveToVfs]
  );

  return (
    <div className="notebook-editor">
      {/* Notebook Toolbar */}
      <div className="notebook-toolbar">
        <button
          className="nb-toolbar-btn"
          onClick={handleRunAll}
          disabled={!state.pyodideReady}
          title="Run All Cells"
        >
          <span className="codicon codicon-run-all" /> Run All
        </button>
        <button
          className="nb-toolbar-btn"
          onClick={() => {
            const lastId = cells[cells.length - 1]?.id;
            if (lastId) addCell(lastId, 'code');
          }}
          title="Add Code Cell"
        >
          <span className="codicon codicon-add" /> Code
        </button>
        <button
          className="nb-toolbar-btn"
          onClick={() => {
            const lastId = cells[cells.length - 1]?.id;
            if (lastId) addCell(lastId, 'markdown');
          }}
          title="Add Markdown Cell"
        >
          <span className="codicon codicon-markdown" /> Markdown
        </button>
        <button
          className="nb-toolbar-btn"
          onClick={clearAllOutputs}
          title="Clear All Outputs"
        >
          <span className="codicon codicon-clear-all" /> Clear Outputs
        </button>
        <span className="nb-toolbar-info">
          {filePath} · {cells.length} cell{cells.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Cells */}
      <div className="notebook-cells">
        {cells.map((cell, idx) => (
          <div key={cell.id} className="nb-cell-wrapper">
            <div
              className={`nb-cell ${cell.cell_type} ${
                focusedCell === cell.id ? 'focused' : ''
              } ${cell.running ? 'running' : ''}`}
              onClick={() => setFocusedCell(cell.id)}
            >
            {/* Cell sidebar */}
            <div className="nb-cell-sidebar">
              {cell.cell_type === 'code' ? (
                <button
                  className="nb-run-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRunCell(cell.id);
                  }}
                  disabled={!state.pyodideReady || cell.running}
                  title="Run Cell"
                >
                  {cell.running ? (
                    <span className="codicon codicon-loading nb-spin" />
                  ) : (
                    <span className="codicon codicon-play" />
                  )}
                </button>
              ) : (
                <span className="nb-cell-type-badge">M</span>
              )}
              <span className="nb-exec-count">
                {cell.cell_type === 'code' && cell.execution_count
                  ? `[${cell.execution_count}]`
                  : cell.cell_type === 'code'
                  ? '[ ]'
                  : ''}
              </span>
            </div>

            {/* Cell content */}
            <div className="nb-cell-content">
              {/* Cell toolbar */}
              {focusedCell === cell.id && (
                <div className="nb-cell-toolbar">
                  <button
                    onClick={() => moveCell(cell.id, -1)}
                    disabled={idx === 0}
                    title="Move Up"
                  >
                    <span className="codicon codicon-arrow-up" />
                  </button>
                  <button
                    onClick={() => moveCell(cell.id, 1)}
                    disabled={idx === cells.length - 1}
                    title="Move Down"
                  >
                    <span className="codicon codicon-arrow-down" />
                  </button>
                  <button
                    onClick={() => toggleCellType(cell.id)}
                    title={`Switch to ${cell.cell_type === 'code' ? 'Markdown' : 'Code'}`}
                  >
                    <span
                      className={`codicon ${
                        cell.cell_type === 'code'
                          ? 'codicon-markdown'
                          : 'codicon-code'
                      }`}
                    />
                  </button>
                  {cell.cell_type === 'code' && cell.outputs.length > 0 && (
                    <button
                      onClick={() => clearCellOutput(cell.id)}
                      title="Clear Output"
                    >
                      <span className="codicon codicon-clear-all" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteCell(cell.id)}
                    title="Delete Cell"
                    disabled={cells.length <= 1}
                  >
                    <span className="codicon codicon-trash" />
                  </button>
                </div>
              )}

              {/* Code Cell */}
              {cell.cell_type === 'code' && (
                <>
                  <div className="nb-code-editor">
                    <Editor
                      height={Math.max(
                        38,
                        Math.min(400, cell.source.split('\n').length * 20 + 18)
                      )}
                      language="python"
                      value={cell.source}
                      theme="pycode-notebook"
                      onChange={(v) => updateCellSource(cell.id, v || '')}
                      options={{
                        fontFamily:
                          "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
                        fontSize: 13,
                        lineHeight: 20,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: 'off',
                        glyphMargin: false,
                        folding: false,
                        lineDecorationsWidth: 0,
                        lineNumbersMinChars: 0,
                        renderLineHighlight: 'none',
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        overviewRulerBorder: false,
                        stickyScroll: { enabled: false },
                        scrollbar: {
                          vertical: 'hidden',
                          horizontal: 'auto',
                          alwaysConsumeMouseWheel: false,
                        },
                        padding: { top: 8, bottom: 8 },
                        automaticLayout: true,
                        wordWrap: 'on',
                        tabSize: 4,
                      }}
                    />
                  </div>
                  {/* Output */}
                  {cell.outputs.length > 0 && (
                    <div className="nb-output">
                      {cell.outputs.map((out, i) => (
                        out.imageData ? (
                          <div key={i} className="nb-output-image">
                            <img src={out.imageData} alt={`Plot output ${i + 1}`} />
                          </div>
                        ) : (
                          <pre
                            key={i}
                            className={`nb-output-line ${out.output_type}`}
                          >
                            {out.text}
                          </pre>
                        )
                      ))}
                    </div>
                  )}
                  {/* Inline input widget for input() */}
                  {pendingInput && pendingInput.cellId === cell.id && (
                    <div className="nb-input-widget">
                      <span className="nb-input-prompt">{pendingInput.prompt || 'input:'}</span>
                      <input
                        type="text"
                        className="nb-input-field"
                        autoFocus
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            const buf = pendingInput.buffer;
                            const int32 = new Int32Array(buf);
                            const uint8 = new Uint8Array(buf);
                            const encoded = new TextEncoder().encode(val);
                            int32[1] = encoded.length;
                            uint8.set(encoded, 8);
                            Atomics.store(int32, 0, 1);
                            Atomics.notify(int32, 0);
                            // Add the input as output for display
                            setCells((prev) =>
                              prev.map((c) =>
                                c.id === cell.id
                                  ? {
                                      ...c,
                                      outputs: [
                                        ...c.outputs,
                                        { output_type: 'stdout' as const, text: val },
                                      ],
                                    }
                                  : c
                              )
                            );
                            setPendingInput(null);
                          }
                        }}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Markdown Cell */}
              {cell.cell_type === 'markdown' && (
                <>
                  {editingMarkdown === cell.id ? (
                    <div className="nb-code-editor">
                      <Editor
                        height={Math.max(
                          60,
                          Math.min(
                            300,
                            cell.source.split('\n').length * 20 + 18
                          )
                        )}
                        language="markdown"
                        value={cell.source}
                        theme="pycode-notebook"
                        onChange={(v) => updateCellSource(cell.id, v || '')}
                        options={{
                          fontFamily:
                            "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
                          fontSize: 13,
                          lineHeight: 20,
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          lineNumbers: 'off',
                          glyphMargin: false,
                          folding: false,
                          lineDecorationsWidth: 0,
                          lineNumbersMinChars: 0,
                          renderLineHighlight: 'none',
                          overviewRulerLanes: 0,
                          scrollbar: {
                            vertical: 'hidden',
                            horizontal: 'auto',
                            alwaysConsumeMouseWheel: false,
                          },
                          padding: { top: 8, bottom: 8 },
                          automaticLayout: true,
                          wordWrap: 'on',
                        }}
                      />
                      <button
                        className="nb-md-done"
                        onClick={() => setEditingMarkdown(null)}
                      >
                        <span className="codicon codicon-check" /> Done
                      </button>
                    </div>
                  ) : (
                    <div
                      className="nb-markdown-rendered"
                      onClick={() => setEditingMarkdown(cell.id)}
                      dangerouslySetInnerHTML={{
                        __html: cell.source.trim()
                          ? renderMarkdown(cell.source)
                          : '<p class="nb-md-placeholder">Click to edit markdown...</p>',
                      }}
                    />
                  )}
                </>
              )}
            </div>
            </div>

            {/* Add cell divider — between cells, as a separate block */}
            <div className="nb-add-cell-divider">
              <div className="nb-divider-line" />
              <button
                className="nb-add-cell-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  addCell(cell.id, 'code');
                }}
                title="Add Code Cell"
              >
                <span className="codicon codicon-add" /> Code
              </button>
              <button
                className="nb-add-cell-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  addCell(cell.id, 'markdown');
                }}
                title="Add Markdown Cell"
              >
                <span className="codicon codicon-add" /> Markdown
              </button>
              <div className="nb-divider-line" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
