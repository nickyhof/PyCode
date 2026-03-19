import { WorkspacePicker } from './WorkspacePicker';
import { useApp } from '../../context/AppContext';

interface TitleBarProps {
  filename: string;
  onToggleTerminal: () => void;
  onToggleCopilot: () => void;
  onOpenPalette: () => void;
}

export function TitleBar({ filename, onToggleTerminal, onToggleCopilot, onOpenPalette }: TitleBarProps) {
  const { state, dispatch } = useApp();

  return (
    <header id="titlebar">
      <div className="titlebar-left">
        <span className="app-icon codicon codicon-code" />
        <span className="app-title">PyCode</span>
      </div>
      <div className="titlebar-center">
        {state.localDirName ? (
          <span className="titlebar-local-dir" title={`Local folder: ${state.localDirName}`}>
            <span className="codicon codicon-folder-opened" style={{ marginRight: 4 }} />
            {state.localDirName}
          </span>
        ) : (
          <WorkspacePicker />
        )}
        <span className="titlebar-sep">—</span>
        <span id="titlebar-filename">{filename}</span>
      </div>
      <div className="titlebar-right">
        <button className="titlebar-btn" title="Command Palette (Ctrl+P)" onClick={onOpenPalette}>
          <span className="codicon codicon-symbol-keyword" />
        </button>
        <button
          className="titlebar-btn theme-toggle-btn"
          title={state.theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          onClick={() => dispatch({ type: 'SET_THEME', theme: state.theme === 'dark' ? 'light' : 'dark' })}
        >
          <span className="codicon codicon-color-mode" />
        </button>
        <button className="titlebar-btn" title="Toggle Terminal" onClick={onToggleTerminal}>
          <span className="codicon codicon-terminal" />
        </button>
        <button className="titlebar-btn" title="Toggle Copilot" onClick={onToggleCopilot}>
          <span className="codicon codicon-copilot" />
        </button>
      </div>
    </header>
  );
}
