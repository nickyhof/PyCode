import { useApp } from '../../context/AppContext';

export function StatusBar() {
  const { state } = useApp();

  const activeFile = state.activeTab;
  const ext = activeFile?.split('.').pop()?.toLowerCase() ?? '';
  const langNames: Record<string, string> = {
    py: 'Python', js: 'JavaScript', ts: 'TypeScript', json: 'JSON',
    md: 'Markdown', html: 'HTML', css: 'CSS', txt: 'Plain Text',
    toml: 'TOML', yaml: 'YAML', xml: 'XML',
  };
  const lang = langNames[ext] || 'Plain Text';

  return (
    <footer id="statusbar">
      <div className="status-left">
        {state.localDirName && (
          <span className="status-item status-local-folder" title={`Local folder: ${state.localDirName}`}>
            <span className="codicon codicon-folder-opened" />
            <span>{state.localDirName}</span>
          </span>
        )}
        <span className="status-item" id="status-branch">
          <span className="codicon codicon-source-control" />
          <span id="status-branch-name">master</span>
        </span>
        {state.settings.githubPat && (
          <span className="status-item status-github" title="Signed in to GitHub">
            <span className="codicon codicon-github" />
            <span>{state.githubUsername || 'GitHub'}</span>
          </span>
        )}
      </div>
      <div className="status-right">
        <span className={`status-item ${state.pyodideReady ? 'ready' : 'loading'}`} id="status-pyodide">
          <span className={`codicon ${state.pyodideReady ? 'codicon-check' : 'codicon-loading codicon-modifier-spin'}`} />
          <span>{state.pyodideReady ? 'Python Ready' : 'Loading Python...'}</span>
        </span>
        <span className="status-item" id="status-language">{lang}</span>
        <span className="status-item" id="status-cursor">Ln {state.cursorLine}, Col {state.cursorCol}</span>
        <span className="status-item">UTF-8</span>
        <span className="status-item">Spaces: {state.settings.tabSize}</span>
      </div>
    </footer>
  );
}
