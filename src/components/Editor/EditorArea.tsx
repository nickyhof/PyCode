import { useRef, useCallback, useEffect } from 'react';
import { Editor, DiffEditor, loader } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useApp } from '../../context/AppContext';
import { useNotification } from '../Notification/Notification';
import { syncFilesToWorker, runPythonFile, emitToTerminal, runPythonCode } from '../../services/pyodide';
import { encodeShareUrl } from '../../services/shareUrl';
import { startServer } from '../../services/webServer';
import { NotebookEditor } from './NotebookEditor';

// Configure Monaco to use our bundled version
import * as monaco from 'monaco-editor';
loader.config({ monaco });

// Define themes at module level so they're available for DiffEditor too
monaco.editor.defineTheme('pycode-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
    'editorCursor.foreground': '#569cd6',
    'editor.lineHighlightBackground': '#2a2d2e',
    'editor.selectionBackground': '#264f78',
  },
});

// Register enhanced Python tokenizer with proper triple-quoted string support
monaco.languages.setMonarchTokensProvider('python', {
  defaultToken: '',
  tokenPostfix: '.python',

  keywords: [
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
    'while', 'with', 'yield',
  ],

  builtins: [
    'abs', 'all', 'any', 'bin', 'bool', 'bytearray', 'bytes', 'callable',
    'chr', 'classmethod', 'compile', 'complex', 'delattr', 'dict', 'dir',
    'divmod', 'enumerate', 'eval', 'exec', 'filter', 'float', 'format',
    'frozenset', 'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex',
    'id', 'input', 'int', 'isinstance', 'issubclass', 'iter', 'len',
    'list', 'locals', 'map', 'max', 'memoryview', 'min', 'next', 'object',
    'oct', 'open', 'ord', 'pow', 'print', 'property', 'range', 'repr',
    'reversed', 'round', 'set', 'setattr', 'slice', 'sorted', 'staticmethod',
    'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip',
  ],

  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.bracket' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
  ],

  tokenizer: {
    root: [
      // Triple-quoted strings (must come before single-quoted)
      [/[fFbBuU]?'''/, 'string', '@tripleString'],
      [/[fFbBuU]?"""/, 'string', '@tripleDQString'],

      // Regular strings
      [/[fFbBuU]?'([^'\\]|\\.)*'/, 'string'],
      [/[fFbBuU]?"([^"\\]|\\.)*"/, 'string'],

      // Decorators
      [/@[a-zA-Z_]\w*/, 'tag'],

      // Comments
      [/#.*$/, 'comment'],

      // Numbers
      [/\b0[xX][0-9a-fA-F_]+\b/, 'number.hex'],
      [/\b0[oO][0-7_]+\b/, 'number.octal'],
      [/\b0[bB][01_]+\b/, 'number.binary'],
      [/\b\d[\d_]*\.[\d_]*([eE][-+]?\d+)?\b/, 'number.float'],
      [/\b\d[\d_]*[eE][-+]?\d+\b/, 'number.float'],
      [/\b\d[\d_]*\b/, 'number'],

      // Identifiers and keywords
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@keywords': 'keyword',
          '@builtins': 'type.identifier',
          '@default': 'identifier',
        },
      }],

      // Operators
      [/[+\-*/%&|^~<>!=]=?/, 'operator'],
      [/[{}()\[\]]/, '@brackets'],
      [/[;,.]/, 'delimiter'],
    ],

    // Triple single-quoted string state (persists across lines)
    tripleString: [
      [/'''/, 'string', '@pop'],
      [/[^'\\]+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, 'string'],
    ],

    // Triple double-quoted string state (persists across lines)
    tripleDQString: [
      [/"""/, 'string', '@pop'],
      [/[^"\\]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string'],
    ],
  },
});

// ─── Python Run CodeLens ────────────────────────────────

let codeLensRegistered = false;

function registerPythonCodeLens(
  vfsRef: () => { getAllFiles: () => Record<string, string> },
  getActiveFile: () => string | null,
) {
  if (codeLensRegistered) return;
  codeLensRegistered = true;

  // Register the "run" command
  monaco.editor.registerCommand('pycode.runFile', (_accessor) => {
    const file = getActiveFile();
    if (!file) return;
    const vfs = vfsRef();
    const allFiles = vfs.getAllFiles();
    const source = allFiles[file] || '';

    // Auto-detect Flask/FastAPI apps and start server instead
    const isFlask = source.includes('Flask(') && source.includes('flask');
    const isFastAPI = source.includes('FastAPI(') && source.includes('fastapi');
    if (isFlask || isFastAPI) {
      emitToTerminal(`\r\n\x1b[90m$ flask run ${file}\x1b[0m\r\n`);
      syncFilesToWorker(allFiles);
      startServer(file);
      return;
    }

    emitToTerminal(`\r\n\x1b[90m$ python ${file}\x1b[0m\r\n`);
    syncFilesToWorker(allFiles);
    runPythonFile(file);
  });

  monaco.editor.registerCommand('pycode.runFunction', (_accessor, funcName: string) => {
    const file = getActiveFile();
    if (!file) return;
    const vfs = vfsRef();
    const allFiles = vfs.getAllFiles();
    let source = allFiles[file] || '';
    emitToTerminal(`\r\n\x1b[90m$ python ${file} → ${funcName}()\x1b[0m\r\n`);
    // Remove the if __name__ == "__main__" block to avoid double execution
    source = source.replace(/^if\s+__name__\s*==\s*["']__main__["']\s*:.*(?:\n(?:[ \t]+.*)?)*/gm, '');
    const augmented = source + `\n${funcName}()`;
    syncFilesToWorker({ ...allFiles, [file]: augmented });
    runPythonFile(file);
  });

  // Register Bazel CodeLens commands
  monaco.editor.registerCommand('pycode.bazelRun', (_accessor, target: string, file: string) => {
    const vfs = vfsRef();
    emitToTerminal(`\r\n\x1b[90m$ bazel run ${target}\x1b[0m\r\n`);
    syncFilesToWorker(vfs.getAllFiles());
    runPythonFile(file);
  });

  monaco.editor.registerCommand('pycode.bazelBuild', (_accessor, target: string, file: string) => {
    const vfs = vfsRef();
    const allFiles = vfs.getAllFiles();
    emitToTerminal(`\r\n\x1b[90m$ bazel build ${target}\x1b[0m\r\n`);
    const source = allFiles[file] || '';
    // Sync and run a compile() check
    syncFilesToWorker(allFiles);
    runPythonCode(`
try:
    compile(${JSON.stringify(source)}, '${file}', 'exec')
    print('\\x1b[32mBUILD SUCCESSFUL:\\x1b[0m ${target}')
except SyntaxError as e:
    print(f'\\x1b[31mBUILD FAILED:\\x1b[0m ${target}')
    print(f'  {e}')
`);
  });

  // Register CodeLens provider for Python
  monaco.languages.registerCodeLensProvider('python', {
    provideCodeLenses(model) {
      const lenses: monaco.languages.CodeLens[] = [];
      const lineCount = model.getLineCount();

      for (let i = 1; i <= lineCount; i++) {
        const line = model.getLineContent(i);

        // Match: if __name__ == "__main__":
        if (/^if\s+__name__\s*==\s*["']__main__["']\s*:/.test(line)) {
          lenses.push({
            range: new monaco.Range(i, 1, i, 1),
            command: {
              id: 'pycode.runFile',
              title: '▶ Run File',
            },
          });
        }
        // Match top-level def (no indentation)
        else if (/^def\s+(\w+)\s*\(/.test(line)) {
          const match = line.match(/^def\s+(\w+)\s*\(/);
          if (match) {
            const funcName = match[1];
            // Show "Run" for main() and test_ functions
            if (funcName === 'main' || funcName.startsWith('test_')) {
              lenses.push({
                range: new monaco.Range(i, 1, i, 1),
                command: {
                  id: 'pycode.runFunction',
                  title: `▶ Run ${funcName}()`,
                  arguments: [funcName],
                },
              });
            }
          }
        }
      }
      return { lenses, dispose: () => {} };
    },
    resolveCodeLens(_model, codeLens) {
      return codeLens;
    },
  });

  // ─── Bazel CodeLens ─────────────────────────────────────
  // Register for all languages since BUILD.bazel files might be detected as various types
  for (const lang of ['python', 'plaintext', 'starlark', 'ini']) {
    monaco.languages.registerCodeLensProvider(lang, {
      provideCodeLenses(model) {
        const uri = model.uri.path;
        // Only apply to BUILD or .bazel files
        if (!uri.endsWith('.bazel') && !uri.endsWith('/BUILD')) return { lenses: [], dispose: () => {} };

        const lenses: monaco.languages.CodeLens[] = [];
        const lineCount = model.getLineCount();
        // Determine the package path from the file
        const pathParts = uri.replace(/^\//, '').split('/');
        const pkg = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';

        for (let i = 1; i <= lineCount; i++) {
          const line = model.getLineContent(i);

          // Match py_binary, py_test, py_library
          const ruleMatch = line.match(/^(py_binary|py_test|py_library)\s*\(/);
          if (ruleMatch) {
            const ruleType = ruleMatch[1];
            // Look ahead for name = "..."
            let targetName = '';
            for (let j = i; j <= Math.min(i + 10, lineCount); j++) {
              const nameLine = model.getLineContent(j);
              const nameMatch = nameLine.match(/name\s*=\s*"([^"]+)"/);
              if (nameMatch) { targetName = nameMatch[1]; break; }
            }
            if (!targetName) continue;

            // Find the srcs to determine which file to run
            let srcFile = '';
            for (let j = i; j <= Math.min(i + 10, lineCount); j++) {
              const srcLine = model.getLineContent(j);
              const srcMatch = srcLine.match(/srcs\s*=\s*\["([^"]+)"/);
              if (srcMatch) { srcFile = pkg ? `${pkg}/${srcMatch[1]}` : srcMatch[1]; break; }
              const mainMatch = srcLine.match(/main\s*=\s*"([^"]+)"/);
              if (mainMatch) { srcFile = pkg ? `${pkg}/${mainMatch[1]}` : mainMatch[1]; break; }
            }

            const label = pkg ? `//${pkg}:${targetName}` : `//:${targetName}`;

            if (ruleType === 'py_binary' && srcFile) {
              lenses.push({
                range: new monaco.Range(i, 1, i, 1),
                command: { id: 'pycode.bazelRun', title: `▶ Run ${label}`, arguments: [label, srcFile] },
              });
            } else if (ruleType === 'py_test' && srcFile) {
              lenses.push({
                range: new monaco.Range(i, 1, i, 1),
                command: { id: 'pycode.bazelRun', title: `▶ Test ${label}`, arguments: [label, srcFile] },
              });
            } else if (ruleType === 'py_library' && srcFile) {
              lenses.push({
                range: new monaco.Range(i, 1, i, 1),
                command: { id: 'pycode.bazelBuild', title: `▶ Build ${label}`, arguments: [label, srcFile] },
              });
            }
          }
        }
        return { lenses, dispose: () => {} };
      },
      resolveCodeLens(_model, codeLens) { return codeLens; },
    });
  }
}

/** Map file extension to Monaco language ID */
function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    py: 'python', js: 'javascript', ts: 'typescript',
    json: 'json', md: 'markdown', html: 'html', css: 'css',
    txt: 'plaintext', yml: 'yaml', yaml: 'yaml', xml: 'xml',
    sh: 'shell', bash: 'shell', toml: 'ini', cfg: 'ini', ini: 'ini',
    tsx: 'typescript', jsx: 'javascript', bazel: 'python',
  };
  return map[ext] || 'plaintext';
}

/** Map file extension to a codicon class */
function getFileIcon(path: string): { icon: string; color: string } {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, { icon: string; color: string }> = {
    py: { icon: 'codicon-symbol-method', color: 'tab-icon-python' },
    js: { icon: 'codicon-symbol-event', color: 'tab-icon-js' },
    ts: { icon: 'codicon-symbol-event', color: 'tab-icon-ts' },
    json: { icon: 'codicon-json', color: 'tab-icon-json' },
    md: { icon: 'codicon-markdown', color: 'tab-icon-md' },
    html: { icon: 'codicon-code', color: 'tab-icon-html' },
    css: { icon: 'codicon-symbol-color', color: 'tab-icon-css' },
    txt: { icon: 'codicon-file-text', color: '' },
    toml: { icon: 'codicon-settings', color: 'tab-icon-toml' },
    bazel: { icon: 'codicon-flame', color: 'tab-icon-json' },
    ipynb: { icon: 'codicon-book', color: 'tab-icon-notebook' },
    yml: { icon: 'codicon-settings', color: 'tab-icon-toml' },
    yaml: { icon: 'codicon-settings', color: 'tab-icon-toml' },
  };
  return map[ext] || { icon: 'codicon-file', color: '' };
}

export function EditorArea() {
  const { state, dispatch, vfs, openFolder, loadSampleProject, saveFileToLocalDisk } = useApp();
  const { notify } = useNotification();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const activeTabRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragIdxRef = useRef<number | null>(null);

  const activeFile = state.activeTab;
  activeTabRef.current = activeFile;
  const fileNode = activeFile ? vfs.get(activeFile) : null;
  const content = fileNode?.type === 'file' ? (fileNode.content ?? '') : '';
  const language = activeFile ? getLanguage(activeFile) : 'plaintext';
  const isNotebook = activeFile?.endsWith('.ipynb') ?? false;

  // Register CodeLens provider once
  useEffect(() => {
    registerPythonCodeLens(
      () => vfs,
      () => activeTabRef.current,
    );
  }, [vfs]);

  const handleEditorMount = useCallback((editor: MonacoEditor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // Track cursor position for status bar
    editor.onDidChangeCursorPosition((e) => {
      dispatch({ type: 'SET_CURSOR', line: e.position.lineNumber, col: e.position.column });
    });

    // Apply PyCode theme
    editor.updateOptions({ theme: 'pycode-dark' });
  }, [dispatch]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (activeFile && value !== undefined) {
      vfs.set(activeFile, value);
      dispatch({ type: 'MARK_DIRTY', path: activeFile, dirty: true });
      dispatch({ type: 'VFS_CHANGED' });

      // Debounced auto-save to local disk
      if (state.localDirHandle) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const pathToSave = activeFile;
        const contentToSave = value;
        saveTimerRef.current = setTimeout(() => {
          saveFileToLocalDisk(pathToSave, contentToSave);
          dispatch({ type: 'MARK_DIRTY', path: pathToSave, dirty: false });
        }, 500);
      }
    }
  }, [activeFile, vfs, dispatch, state.localDirHandle, saveFileToLocalDisk]);

  return (
    <div id="editor-area">
      {/* Tab Bar */}
      <div id="tab-bar">
        <div id="tabs-container">
          {state.tabs.map((tab, idx) => {
            const { icon, color } = getFileIcon(tab.path);
            return (
              <div
                key={tab.path}
                className={`tab${tab.path === state.activeTab ? ' active' : ''}${tab.isDirty ? ' dirty' : ''}`}
                draggable
                onDragStart={() => { dragIdxRef.current = idx; }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => {
                  if (dragIdxRef.current !== null && dragIdxRef.current !== idx) {
                    dispatch({ type: 'REORDER_TABS', fromIndex: dragIdxRef.current, toIndex: idx });
                  }
                  dragIdxRef.current = null;
                }}
                onDragEnd={() => { dragIdxRef.current = null; }}
                onClick={() => {
                  dispatch({ type: 'CLOSE_DIFF' });
                  dispatch({ type: 'SET_ACTIVE_TAB', path: tab.path });
                }}
              >
                <span className={`tab-icon codicon ${icon} ${color}`} />
                <span className="tab-label">{tab.path.split('/').pop()}</span>
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'CLOSE_TAB', path: tab.path });
                  }}
                >
                  <span className="codicon codicon-close" />
                </button>
              </div>
            );
          })}
        </div>
        {state.activeTab && (
          <div className="tab-bar-actions">
            <button
              className="icon-btn share-btn"
              title="Share this file"
              onClick={async () => {
                const path = state.activeTab;
                if (!path) return;
                const entry = vfs.get(path);
                if (!entry || entry.type !== 'file') return;
                try {
                  const url = await encodeShareUrl(path, entry.content || '');
                  await navigator.clipboard.writeText(url);
                  notify('Link copied to clipboard!', 'success');
                } catch {
                  notify('Failed to generate share link', 'error');
                }
              }}
            >
              <span className="codicon codicon-link" />
            </button>
          </div>
        )}
      </div>

      {/* Breadcrumb Bar */}
      {state.activeTab && !state.diffView && (
        <div className="breadcrumb-bar">
          {(() => {
            const parts = state.activeTab.split('/');
            return parts.map((part, i) => {
              const isLast = i === parts.length - 1;
              const { icon, color } = isLast ? getFileIcon(state.activeTab!) : { icon: 'codicon-folder', color: 'breadcrumb-folder' };
              return (
                <span key={i} className="breadcrumb-item">
                  {i > 0 && <span className="breadcrumb-sep codicon codicon-chevron-right" />}
                  <span className={`breadcrumb-icon codicon ${icon} ${color}`} />
                  <span className={isLast ? 'breadcrumb-current' : ''}>{part}</span>
                </span>
              );
            });
          })()}
        </div>
      )}

      {/* Welcome View */}
      {state.tabs.length === 0 && !state.diffView && (
        <div id="welcome-view">
          <div className="welcome-content">
            <div className="welcome-logo">
              <span className="codicon codicon-code" />
            </div>
            <h1>PyCode</h1>
            <p className="welcome-subtitle">Browser-based Python IDE</p>
            <div className="welcome-actions">
              <button
                className="welcome-btn welcome-btn-primary"
                onClick={async () => {
                  try {
                    await openFolder();
                    notify('Local folder opened', 'success');
                  } catch { /* cancelled */ }
                }}
              >
                <span className="codicon codicon-folder-opened" />
                Open Folder
              </button>
              <button
                className="welcome-btn welcome-btn-secondary"
                onClick={async () => {
                  await loadSampleProject();
                  notify('Sample project loaded', 'success');
                }}
              >
                <span className="codicon codicon-rocket" />
                Quick Start
              </button>
            </div>
            <div className="welcome-shortcuts">
              <div className="shortcut"><kbd>Ctrl+N</kbd> New File</div>
              <div className="shortcut"><kbd>Ctrl+J</kbd> New Notebook</div>
              <div className="shortcut"><kbd>F5</kbd> Run Code</div>
              <div className="shortcut"><kbd>Ctrl+`</kbd> Toggle Terminal</div>
            </div>
          </div>
        </div>
      )}

      {/* Diff Editor View */}
      {state.diffView && (
        <div id="editor-container" className="visible">
          <div className="diff-header">
            <span className="codicon codicon-diff" style={{ marginRight: 6 }} />
            <span>{state.diffView.filepath}</span>
            <span style={{ color: 'var(--fg-muted)', marginLeft: 6 }}>(HEAD ↔ Working Tree)</span>
            <button
              className="icon-btn"
              style={{ marginLeft: 'auto' }}
              title="Close Diff"
              onClick={() => dispatch({ type: 'CLOSE_DIFF' })}
            >
              <span className="codicon codicon-close" />
            </button>
          </div>
          <DiffEditor
            height="100%"
            language={getLanguage(state.diffView.filepath)}
            original={state.diffView.oldContent}
            modified={state.diffView.newContent}
            theme="pycode-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
              fontSize: state.settings.fontSize,
              lineHeight: 22,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 8 },
            }}
          />
        </div>
      )}

      {/* Notebook Editor */}
      {state.tabs.length > 0 && !state.diffView && isNotebook && activeFile && (
        <div id="editor-container" className="visible">
          <NotebookEditor filePath={activeFile} />
        </div>
      )}

      {/* Monaco Editor */}
      {state.tabs.length > 0 && !state.diffView && !isNotebook && (
        <div id="editor-container" className="visible">
          <Editor
            height="100%"
            path={activeFile || undefined}
            language={language}
            value={content}
            theme="pycode-dark"
            onMount={handleEditorMount}
            onChange={handleEditorChange}
            options={{
              fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
              fontSize: state.settings.fontSize,
              lineHeight: 22,
              tabSize: state.settings.tabSize,
              minimap: { enabled: state.settings.minimap },
              scrollBeyondLastLine: true,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              folding: true,
              foldingStrategy: 'indentation',
              foldingHighlight: true,
              showFoldingControls: 'mouseover',
              padding: { top: 8 },
              automaticLayout: true,
              wordWrap: state.settings.wordWrap ? 'on' : 'off',
            }}
          />
        </div>
      )}
    </div>
  );
}
