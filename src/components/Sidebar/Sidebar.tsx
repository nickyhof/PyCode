import { useApp } from '../../context/AppContext';
import { FileTree } from './FileTree';
import { SettingsPanel } from './SettingsPanel';
import type { SidebarPanel } from '../../types';

interface SidebarProps {
  activePanel: SidebarPanel;
}

export function Sidebar({ activePanel }: SidebarProps) {
  const { dispatch, vfs } = useApp();

  return (
    <>
      {/* Explorer */}
      <div className={`sidebar-panel${activePanel === 'explorer' ? ' active' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">EXPLORER</span>
          <div className="sidebar-actions">
            <button className="icon-btn" title="New File" onClick={() => {
              const name = prompt('New file name:', 'untitled.py');
              if (!name) return;
              vfs.set(name, '');
              dispatch({ type: 'VFS_CHANGED' });
              dispatch({ type: 'OPEN_FILE', path: name });
            }}>
              <span className="codicon codicon-new-file" />
            </button>
            <button className="icon-btn" title="New Folder" onClick={() => {
              const name = prompt('New folder name:', 'new-folder');
              if (!name) return;
              vfs.set(name + '/.keep', '');
              dispatch({ type: 'VFS_CHANGED' });
              dispatch({ type: 'TOGGLE_DIR', path: name });
            }}>
              <span className="codicon codicon-new-folder" />
            </button>
          </div>
        </div>
        <div className="sidebar-body">
          <FileTree />
        </div>
      </div>

      {/* Search */}
      <div className={`sidebar-panel${activePanel === 'search' ? ' active' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">SEARCH</span>
        </div>
        <div className="sidebar-body" style={{ padding: '8px 12px' }}>
          <input type="text" id="search-input" placeholder="Search files..." style={{ width: '100%' }} />
          <div id="search-results" style={{ marginTop: 8 }} />
        </div>
      </div>

      {/* Source Control */}
      <div className={`sidebar-panel${activePanel === 'git' ? ' active' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">SOURCE CONTROL</span>
        </div>
        <div className="sidebar-body" style={{ padding: '8px 12px', color: 'var(--fg-secondary)' }}>
          <p style={{ fontSize: 11, marginBottom: 8 }}>Use terminal commands:</p>
          <code style={{ fontSize: 11 }}>git status, git add, git commit</code>
        </div>
      </div>

      {/* Extensions */}
      <div className={`sidebar-panel${activePanel === 'extensions' ? ' active' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">EXTENSIONS</span>
        </div>
        <div className="sidebar-body" style={{ padding: '8px 12px', color: 'var(--fg-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span className="codicon codicon-copilot" /> Copilot — Enabled
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="codicon codicon-symbol-method" style={{ color: '#519aba' }} /> Python — Built-in
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className={`sidebar-panel${activePanel === 'settings' ? ' active' : ''}`}>
        <SettingsPanel />
      </div>
    </>
  );
}
