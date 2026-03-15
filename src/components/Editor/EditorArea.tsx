import { useRef, useCallback } from 'react';
import { Editor, loader } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useApp } from '../../context/AppContext';

// Configure Monaco to use our bundled version
import * as monaco from 'monaco-editor';
loader.config({ monaco });

/** Map file extension to Monaco language ID */
function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    py: 'python', js: 'javascript', ts: 'typescript',
    json: 'json', md: 'markdown', html: 'html', css: 'css',
    txt: 'plaintext', yml: 'yaml', yaml: 'yaml', xml: 'xml',
    sh: 'shell', bash: 'shell', toml: 'ini', cfg: 'ini', ini: 'ini',
    tsx: 'typescript', jsx: 'javascript',
  };
  return map[ext] || 'plaintext';
}

/** Map file extension to a codicon class */
function getFileIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    py: 'codicon-symbol-method', js: 'codicon-symbol-event',
    json: 'codicon-json', md: 'codicon-markdown',
    html: 'codicon-code', css: 'codicon-symbol-color',
    txt: 'codicon-file-text', toml: 'codicon-settings',
  };
  return icons[ext] || 'codicon-file';
}

export function EditorArea() {
  const { state, dispatch, vfs } = useApp();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const activeFile = state.activeTab;
  const activeEntry = activeFile ? vfs.get(activeFile) : undefined;
  const content = activeEntry?.type === 'file' ? (activeEntry.content ?? '') : '';
  const language = activeFile ? getLanguage(activeFile) : 'plaintext';

  const handleEditorMount = useCallback((editor: MonacoEditor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // Define PyCode dark theme
    monaco.editor.defineTheme('pycode-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'type', foreground: '4EC9B0' },
        { token: 'function', foreground: 'DCDCAA' },
        { token: 'variable', foreground: '9CDCFE' },
        { token: 'operator', foreground: 'D4D4D4' },
        { token: 'decorator', foreground: 'D7BA7D' },
      ],
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#d4d4d4',
        'editorCursor.foreground': '#aeafad',
        'editor.lineHighlightBackground': '#2a2d2e',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41',
        'editorLineNumber.foreground': '#5a5a5a',
        'editorLineNumber.activeForeground': '#c6c6c6',
        'editorIndentGuide.background': '#404040',
        'editorIndentGuide.activeBackground': '#707070',
      },
    });
    editor.updateOptions({ theme: 'pycode-dark' });
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (activeFile && value !== undefined) {
      vfs.set(activeFile, value);
      dispatch({ type: 'MARK_DIRTY', path: activeFile, dirty: true });
    }
  }, [activeFile, vfs, dispatch]);

  return (
    <div id="editor-area">
      {/* Tab Bar */}
      <div id="tab-bar">
        <div id="tabs-container">
          {state.tabs.map((tab) => (
            <div
              key={tab.path}
              className={`tab${tab.path === activeFile ? ' active' : ''}${tab.isDirty ? ' dirty' : ''}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', path: tab.path })}
            >
              <span className={`tab-icon codicon ${getFileIcon(tab.path)}`} />
              <span className="tab-label">{tab.path.split('/').pop()}</span>
              <span className="tab-dirty" />
              <button
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'CLOSE_TAB', path: tab.path }); }}
              >
                <span className="codicon codicon-close" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Welcome View */}
      {state.tabs.length === 0 && (
        <div id="welcome-view">
          <div className="welcome-content">
            <div className="welcome-logo">
              <span className="codicon codicon-code" />
            </div>
            <h1>PyCode</h1>
            <p className="welcome-subtitle">Browser-based Python IDE</p>
            <div className="welcome-shortcuts">
              <div className="shortcut"><kbd>Ctrl+N</kbd> New File</div>
              <div className="shortcut"><kbd>F5</kbd> Run Code</div>
              <div className="shortcut"><kbd>Ctrl+`</kbd> Toggle Terminal</div>
            </div>
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      {state.tabs.length > 0 && (
        <div id="editor-container" className="visible">
          <Editor
            height="100%"
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
