/**
 * WorkspacePicker — dropdown to manage and switch between workspaces.
 * Workspaces are persisted in localStorage.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

function getWorkspaces(): string[] {
  try {
    return JSON.parse(localStorage.getItem('pycode-workspaces') || '["default"]');
  } catch {
    return ['default'];
  }
}

function saveWorkspaces(list: string[]): void {
  localStorage.setItem('pycode-workspaces', JSON.stringify(list));
}

function getCurrentWorkspace(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('ws') || localStorage.getItem('pycode-current-ws') || 'default';
}

function switchWorkspace(name: string): void {
  localStorage.setItem('pycode-current-ws', name);
  const url = new URL(window.location.href);
  url.searchParams.set('ws', name);
  url.searchParams.delete('repo');
  window.location.href = url.toString();
}

export function WorkspacePicker() {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<string[]>(getWorkspaces);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const current = getCurrentWorkspace();
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ensure current workspace is in the list
  useEffect(() => {
    const list = getWorkspaces();
    if (!list.includes(current)) {
      list.push(current);
      saveWorkspaces(list);
      setWorkspaces(list);
    }
    localStorage.setItem('pycode-current-ws', current);
  }, [current]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Auto-focus input when creating
  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [creating]);

  const handleDelete = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (name === 'default' || name === current) return;
    const dbName = name === 'default' ? 'pycode-fs' : `pycode-ws-${name}`;
    indexedDB.deleteDatabase(dbName);
    const updated = getWorkspaces().filter(w => w !== name);
    saveWorkspaces(updated);
    setWorkspaces(updated);
  }, [current]);

  const handleCreate = useCallback(() => {
    const slug = newName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!slug) {
      setCreating(false);
      return;
    }
    const list = getWorkspaces();
    if (!list.includes(slug)) {
      list.push(slug);
      saveWorkspaces(list);
    }
    setCreating(false);
    setNewName('');
    switchWorkspace(slug);
  }, [newName]);

  return (
    <div className="workspace-picker" ref={pickerRef}>
      <button
        className="workspace-btn"
        title="Switch Workspace"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        <span className="codicon codicon-folder" />
        <span>{current}</span>
        <span className="codicon codicon-chevron-down" />
      </button>

      {open && (
        <div className="workspace-dropdown">
          {workspaces.map((ws) => (
            <button
              key={ws}
              className={`workspace-dropdown-item ${ws === current ? 'active' : ''}`}
              onClick={() => {
                if (ws !== current) switchWorkspace(ws);
                setOpen(false);
              }}
            >
              <span className="codicon codicon-folder" />
              {ws}
              {ws !== 'default' && ws !== current && (
                <span
                  className="ws-delete codicon codicon-trash"
                  title="Delete workspace"
                  onClick={(e) => handleDelete(ws, e)}
                />
              )}
            </button>
          ))}

          <div className="workspace-dropdown-divider" />

          {creating ? (
            <div className="workspace-dropdown-item" style={{ padding: '4px 12px' }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="workspace name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--fg-accent)',
                  color: 'var(--fg-primary)',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-ui)',
                  outline: 'none',
                }}
              />
            </div>
          ) : (
            <button
              className="workspace-dropdown-item"
              onClick={(e) => { e.stopPropagation(); setCreating(true); }}
            >
              <span className="codicon codicon-add" />
              New Workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}
