

interface TitleBarProps {
  filename: string;
  onToggleTerminal: () => void;
  onToggleCopilot: () => void;
}

export function TitleBar({ filename, onToggleTerminal, onToggleCopilot }: TitleBarProps) {
  return (
    <header id="titlebar">
      <div className="titlebar-left">
        <span className="app-icon codicon codicon-code" />
        <span className="app-title">PyCode</span>
      </div>
      <div className="titlebar-center">
        <span className="titlebar-sep">—</span>
        <span id="titlebar-filename">{filename}</span>
      </div>
      <div className="titlebar-right">
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
