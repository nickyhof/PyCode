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
  const { state, dispatch, vfs, openFolder } = useApp();
  const { prompt } = useDialog();
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const hasProject = state.vfsVersion > 0;

  const handleSearch = useCallback((query: string, caseSensitive?: boolean) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const cs = caseSensitive ?? matchCase;
    const results: SearchResult[] = [];
    const compareQuery = cs ? query : query.toLowerCase();
    const allFiles = vfs.getAllFiles();

    for (const [filepath, content] of Object.entries(allFiles)) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = cs ? lines[i] : lines[i].toLowerCase();
        if (line.includes(compareQuery)) {
          results.push({ filepath, line: i + 1, content: lines[i].trim() });
          if (results.length >= 100) break;
        }
      }
      if (results.length >= 100) break;
    }

    setSearchResults(results);
  }, [vfs, matchCase]);

  return (
    <>
      {/* Explorer */}
      <div className={`sidebar-panel${activePanel === 'explorer' ? ' active' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">EXPLORER</span>
          <div className="sidebar-actions">
            <button className="icon-btn" title="Open Local Folder" onClick={() => openFolder()}>
              <span className="codicon codicon-folder-opened" />
            </button>
            <button className="icon-btn" title="New File" disabled={!hasProject} onClick={async () => {
              const name = await prompt({ title: 'New File', defaultValue: 'untitled.py', placeholder: 'Enter file name...' });
              if (!name) return;
              vfs.set(name, '');
              dispatch({ type: 'VFS_CHANGED' });
              dispatch({ type: 'OPEN_FILE', path: name });
            }}>
              <span className="codicon codicon-new-file" />
            </button>
            <button className="icon-btn" title="New Notebook" disabled={!hasProject} onClick={async () => {
              const name = await prompt({ title: 'New Notebook', defaultValue: 'untitled.ipynb', placeholder: 'Enter notebook name...' });
              if (!name) return;
              const nbName = name.endsWith('.ipynb') ? name : name + '.ipynb';
              const emptyNotebook = JSON.stringify({
                cells: [{ cell_type: 'code', source: '', metadata: {}, outputs: [], execution_count: null }],
                metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } },
                nbformat: 4, nbformat_minor: 5
              }, null, 2);
              vfs.set(nbName, emptyNotebook);
              dispatch({ type: 'VFS_CHANGED' });
              dispatch({ type: 'OPEN_FILE', path: nbName });
            }}>
              <span className="codicon codicon-notebook" />
            </button>
            <button className="icon-btn" title="New Folder" disabled={!hasProject} onClick={async () => {
              const name = await prompt({ title: 'New Folder', defaultValue: 'new-folder', placeholder: 'Enter folder name...' });
              if (!name) return;
              vfs.set(name + '/.keep', '');
              dispatch({ type: 'VFS_CHANGED' });
              dispatch({ type: 'TOGGLE_DIR', path: name });
            }}>
              <span className="codicon codicon-new-folder" />
            </button>
            <button className="icon-btn" title="Export as ZIP" disabled={!hasProject} onClick={async () => {
              const JSZip = (await import('jszip')).default;
              const zip = new JSZip();
              const allFiles = vfs.getAllFiles();
              for (const [path, content] of Object.entries(allFiles)) {
                zip.file(path, content);
              }
              const blob = await zip.generateAsync({ type: 'blob' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'pycode-project.zip';
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <span className="codicon codicon-cloud-download" />
            </button>
          </div>
        </div>
        <div className="sidebar-body">
          <FileTree />
        </div>
      </div>

      {/* Search & Replace */}
      <div className={`sidebar-panel${activePanel === 'search' ? ' active' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">SEARCH</span>
        </div>
        <div className="sidebar-body">
          <div className="search-container">
            <div className="search-input-row">
              <input
                type="text"
                className="search-box"
                placeholder="Search in files..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
              <button
                className={`icon-btn search-toggle${matchCase ? ' active' : ''}`}
                title="Match Case"
                onClick={() => {
                  const next = !matchCase;
                  setMatchCase(next);
                  if (searchQuery.trim()) handleSearch(searchQuery, next);
                }}
              >
                Aa
              </button>
            </div>
            <div className="search-replace-row">
              <input
                type="text"
                className="search-box"
                placeholder="Replace..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
              />
              <button
                className="icon-btn"
                title="Replace All"
                onClick={() => {
                  if (!searchQuery.trim()) return;
                  const allFiles = vfs.getAllFiles();
                  let totalReplacements = 0;
                  const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const re = new RegExp(escaped, matchCase ? 'g' : 'gi');
                  for (const [filepath, content] of Object.entries(allFiles)) {
                    const matches = content.match(re);
                    if (matches) {
                      const newContent = content.replace(re, replaceQuery);
                      totalReplacements += matches.length;
                      vfs.set(filepath, newContent);
                    }
                  }
                  if (totalReplacements > 0) {
                    dispatch({ type: 'VFS_CHANGED' });
                    handleSearch(searchQuery); // Refresh results
                  }
                }}
              >
                <span className="codicon codicon-replace-all" />
              </button>
            </div>
            {searchQuery.trim() && (
              <div className="search-summary">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} in {new Set(searchResults.map(r => r.filepath)).size} file{new Set(searchResults.map(r => r.filepath)).size !== 1 ? 's' : ''}
              </div>
            )}
            <div className="search-results">
              {searchQuery.trim() && searchResults.length === 0 && (
                <div style={{ padding: '8px 0', color: 'var(--fg-muted)', fontSize: 11 }}>
                  No results found
                </div>
              )}
              {/* Group results by file */}
              {(() => {
                const grouped: Record<string, SearchResult[]> = {};
                for (const r of searchResults) {
                  if (!grouped[r.filepath]) grouped[r.filepath] = [];
                  grouped[r.filepath].push(r);
                }
                return Object.entries(grouped).map(([filepath, results]) => (
                  <div key={filepath} className="search-file-group">
                    <div
                      className="search-file-header"
                      onClick={() => dispatch({ type: 'OPEN_FILE', path: filepath })}
                    >
                      <span className="codicon codicon-file" style={{ fontSize: 12, marginRight: 4 }} />
                      {filepath}
                      <span className="search-file-count">{results.length}</span>
                    </div>
                    {results.map((result, idx) => (
                      <div
                        key={idx}
                        className="search-result-item"
                        onClick={() => dispatch({ type: 'OPEN_FILE', path: result.filepath })}
                      >
                        <span className="search-result-line-num">{result.line}</span>
                        <span className="search-result-line">
                          {highlightMatch(result.content, searchQuery)}
                        </span>
                        {replaceQuery !== undefined && searchQuery.trim() && (
                          <button
                            className="search-replace-btn"
                            title="Replace in this file"
                            onClick={(e) => {
                              e.stopPropagation();
                              const entry = vfs.get(result.filepath);
                              if (entry?.type === 'file' && entry.content) {
                                const lines = entry.content.split('\n');
                                const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const re = new RegExp(escaped, matchCase ? '' : 'i');
                                lines[result.line - 1] = lines[result.line - 1].replace(re, replaceQuery);
                                vfs.set(result.filepath, lines.join('\n'));
                                dispatch({ type: 'VFS_CHANGED' });
                                handleSearch(searchQuery);
                              }
                            }}
                          >
                            <span className="codicon codicon-replace" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ));
              })()}
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
