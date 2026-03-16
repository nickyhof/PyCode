import { useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { useDialog } from '../Dialog/Dialog';
import { FileTree } from './FileTree';
import { SettingsPanel } from './SettingsPanel';
import { GitPanel } from './GitPanel';
import { PackagesPanel } from './PackagesPanel';
import type { SidebarPanel } from '../../types';

interface SidebarProps {
  activePanel: SidebarPanel;
}

interface SearchResult {
  filepath: string;
  line: number;
  content: string;
}

export function Sidebar({ activePanel }: SidebarProps) {
  const { dispatch, vfs } = useApp();
  const { prompt } = useDialog();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();
    const allFiles = vfs.getAllFiles();

    for (const [filepath, content] of Object.entries(allFiles)) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          results.push({ filepath, line: i + 1, content: lines[i].trim() });
          if (results.length >= 100) break;
        }
      }
      if (results.length >= 100) break;
    }

    setSearchResults(results);
  }, [vfs]);

  return (
    <>
      {/* Explorer */}
      <div className={`sidebar-panel${activePanel === 'explorer' ? ' active' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">EXPLORER</span>
          <div className="sidebar-actions">
            <button className="icon-btn" title="New File" onClick={async () => {
              const name = await prompt({ title: 'New File', defaultValue: 'untitled.py', placeholder: 'Enter file name...' });
              if (!name) return;
              vfs.set(name, '');
              dispatch({ type: 'VFS_CHANGED' });
              dispatch({ type: 'OPEN_FILE', path: name });
            }}>
              <span className="codicon codicon-new-file" />
            </button>
            <button className="icon-btn" title="New Folder" onClick={async () => {
              const name = await prompt({ title: 'New Folder', defaultValue: 'new-folder', placeholder: 'Enter folder name...' });
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
        <div className="sidebar-body">
          <div className="search-container">
            <input
              type="text"
              className="search-box"
              placeholder="Search in files..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
            <div className="search-results">
              {searchQuery.trim() && searchResults.length === 0 && (
                <div style={{ padding: '8px 0', color: 'var(--fg-muted)', fontSize: 11 }}>
                  No results found
                </div>
              )}
              {searchResults.map((result, idx) => (
                <div
                  key={`${result.filepath}:${result.line}:${idx}`}
                  className="search-result-item"
                  onClick={() => dispatch({ type: 'OPEN_FILE', path: result.filepath })}
                >
                  <div className="search-result-file">
                    <span className="codicon codicon-file" style={{ fontSize: 12, marginRight: 4 }} />
                    {result.filepath}
                    <span style={{ color: 'var(--fg-muted)', marginLeft: 4 }}>:{result.line}</span>
                  </div>
                  <div className="search-result-line">
                    {highlightMatch(result.content, searchQuery)}
                  </div>
                </div>
              ))}
              {searchResults.length >= 100 && (
                <div style={{ padding: '4px 0', color: 'var(--fg-muted)', fontSize: 11 }}>
                  Results limited to 100 matches
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Source Control */}
      <div className={`sidebar-panel${activePanel === 'git' ? ' active' : ''}`}>
        <GitPanel />
      </div>

      {/* Packages */}
      <div className={`sidebar-panel${activePanel === 'extensions' ? ' active' : ''}`}>
        <PackagesPanel />
      </div>

      {/* Settings */}
      <div className={`sidebar-panel${activePanel === 'settings' ? ' active' : ''}`}>
        <SettingsPanel />
      </div>
    </>
  );
}

/** Highlight matching text within a line */
function highlightMatch(text: string, query: string) {
  if (!query) return <span>{text}</span>;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return <span>{text}</span>;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <span>
      {before}
      <span className="search-result-match">{match}</span>
      {after}
    </span>
  );
}
