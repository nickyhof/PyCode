/**
 * CommandPalette — VS Code-style command palette.
 * Ctrl+P opens file search, typing ">" switches to command mode.
 */

import { useState, useEffect, useRef, useCallback, createContext, useContext, type ReactNode } from 'react';
import { useApp } from '../../context/AppContext';
import { syncFilesToWorker, runPythonFile } from '../../services/pyodide';
import { encodeShareUrl } from '../../services/shareUrl';
import { useNotification } from '../Notification/Notification';

// ─── Context for opening the palette from anywhere ──────

interface CommandPaletteContextValue {
  open: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  return ctx;
}

// ─── Types ──────────────────────────────────────────────

interface PaletteCommand {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
}

// ─── Provider + Component ───────────────────────────────

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');

  const open = useCallback(() => { setInitialQuery(''); setIsOpen(true); }, []);
  const close = useCallback(() => setIsOpen(false), []);

  // Global Ctrl+P / Ctrl+Shift+P shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setInitialQuery('');
        setIsOpen(prev => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setInitialQuery('>');
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <CommandPaletteContext.Provider value={{ open }}>
      {children}
      {isOpen && <CommandPaletteOverlay onClose={close} initialQuery={initialQuery} />}
    </CommandPaletteContext.Provider>
  );
}

// ─── Overlay ────────────────────────────────────────────

function CommandPaletteOverlay({ onClose, initialQuery = '' }: { onClose: () => void; initialQuery?: string }) {
  const { state, dispatch, vfs, openFolder, loadSampleProject, saveToLocal } = useApp();
  const { notify } = useNotification();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isCommandMode = query.startsWith('>');
  const searchTerm = isCommandMode ? query.slice(1).trim().toLowerCase() : query.trim().toLowerCase();

  // ── Build command list ──
  const commands: PaletteCommand[] = [
    {
      id: 'open-folder',
      label: 'Open Local Folder',
      icon: 'codicon-folder-opened',
      action: () => openFolder(),
    },
    {
      id: 'load-sample',
      label: 'Load Sample Project',
      icon: 'codicon-rocket',
      action: () => loadSampleProject(),
    },
    {
      id: 'save-all-to-disk',
      label: 'Save All to Disk',
      icon: 'codicon-save-all',
      action: () => saveToLocal(),
    },
    {
      id: 'toggle-terminal',
      label: 'Toggle Terminal',
      icon: 'codicon-terminal',
      shortcut: 'Ctrl+`',
      action: () => dispatch({ type: 'TOGGLE_PANEL' }),
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      icon: 'codicon-layout-sidebar-left',
      shortcut: 'Ctrl+B',
      action: () => dispatch({ type: 'TOGGLE_SIDEBAR' }),
    },
    {
      id: 'toggle-copilot',
      label: 'Toggle Copilot',
      icon: 'codicon-copilot',
      action: () => dispatch({ type: 'TOGGLE_COPILOT' }),
    },
    {
      id: 'explorer',
      label: 'Show Explorer',
      icon: 'codicon-files',
      shortcut: 'Ctrl+Shift+E',
      action: () => dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'explorer' }),
    },
    {
      id: 'search',
      label: 'Show Search',
      icon: 'codicon-search',
      shortcut: 'Ctrl+Shift+F',
      action: () => dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'search' }),
    },
    {
      id: 'git',
      label: 'Show Source Control',
      icon: 'codicon-source-control',
      shortcut: 'Ctrl+Shift+G',
      action: () => dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'git' }),
    },
    {
      id: 'packages',
      label: 'Show Packages',
      icon: 'codicon-package',
      action: () => dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'extensions' }),
    },
    {
      id: 'settings',
      label: 'Open Settings',
      icon: 'codicon-settings-gear',
      action: () => dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'settings' }),
    },
    {
      id: 'run-file',
      label: 'Run Active File',
      icon: 'codicon-play',
      shortcut: 'F5',
      action: () => {
        const file = state.activeTab || 'main.py';
        if (!state.pyodideReady) return;
        if (state.panelCollapsed) dispatch({ type: 'TOGGLE_PANEL' });
        syncFilesToWorker(vfs.getAllFiles());
        setTimeout(() => runPythonFile(file), 50);
      },
    },
    {
      id: 'close-tab',
      label: 'Close Active Tab',
      icon: 'codicon-close',
      shortcut: 'Ctrl+W',
      action: () => { if (state.activeTab) dispatch({ type: 'CLOSE_TAB', path: state.activeTab }); },
    },
    {
      id: 'share-file',
      label: 'Share Current File',
      icon: 'codicon-link',
      action: async () => {
        const path = state.activeTab;
        if (!path) return;
        const entry = vfs.get(path);
        if (!entry || entry.type !== 'file') return;
        try {
          const url = await encodeShareUrl(path, entry.content || '');
          await navigator.clipboard.writeText(url);
          notify('Share link copied to clipboard!', 'success');
        } catch {
          notify('Failed to generate share link', 'error');
        }
      },
    },
    {
      id: 'close-diff',
      label: 'Close Diff View',
      icon: 'codicon-diff',
      action: () => dispatch({ type: 'CLOSE_DIFF' }),
    },
  ];

  // ── Build file list ──
  const allFiles = Object.keys(vfs.getAllFiles());

  // ── Filter results ──
  let items: { type: 'file' | 'command'; label: string; detail?: string; icon?: string; shortcut?: string; action: () => void }[] = [];

  if (isCommandMode) {
    items = commands
      .filter(cmd => !searchTerm || cmd.label.toLowerCase().includes(searchTerm))
      .map(cmd => ({
        type: 'command' as const,
        label: cmd.label,
        icon: cmd.icon,
        shortcut: cmd.shortcut,
        action: cmd.action,
      }));
  } else {
    // File search mode — fuzzy match
    const matchingFiles = allFiles
      .filter(f => !searchTerm || f.toLowerCase().includes(searchTerm))
      .sort((a, b) => {
        // Prioritize exact prefix matches
        const aStarts = a.toLowerCase().startsWith(searchTerm);
        const bStarts = b.toLowerCase().startsWith(searchTerm);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 20);

    items = matchingFiles.map(filepath => {
      const filename = filepath.split('/').pop() || filepath;
      const dir = filepath.includes('/') ? filepath.substring(0, filepath.lastIndexOf('/')) : '';
      return {
        type: 'file' as const,
        label: filename,
        detail: dir,
        icon: getFileIcon(filepath),
        action: () => {
          dispatch({ type: 'CLOSE_DIFF' });
          dispatch({ type: 'OPEN_FILE', path: filepath });
        },
      };
    });
  }

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].action();
        onClose();
      }
    }
  }, [items, selectedIndex, onClose]);

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <div className="cmd-palette-input-row">
          <span className="codicon codicon-search cmd-palette-search-icon" />
          <input
            ref={inputRef}
            className="cmd-palette-input"
            type="text"
            placeholder={isCommandMode ? 'Type a command...' : 'Search files by name (type > for commands)'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="cmd-palette-list" ref={listRef}>
          {items.length === 0 && (
            <div className="cmd-palette-empty">
              {isCommandMode ? 'No matching commands' : 'No matching files'}
            </div>
          )}
          {items.map((item, idx) => (
            <div
              key={`${item.type}-${item.label}-${idx}`}
              className={`cmd-palette-item${idx === selectedIndex ? ' selected' : ''}`}
              onClick={() => { item.action(); onClose(); }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              {item.icon && <span className={`codicon ${item.icon} cmd-palette-item-icon`} />}
              <span className="cmd-palette-item-label">{item.label}</span>
              {item.detail && <span className="cmd-palette-item-detail">{item.detail}</span>}
              {item.shortcut && <span className="cmd-palette-item-shortcut">{item.shortcut}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── File icon helper ───────────────────────────────────

function getFileIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    py: 'codicon-symbol-method',
    js: 'codicon-symbol-event',
    ts: 'codicon-symbol-event',
    json: 'codicon-json',
    md: 'codicon-markdown',
    html: 'codicon-code',
    css: 'codicon-symbol-color',
    txt: 'codicon-file-text',
    toml: 'codicon-settings',
    bazel: 'codicon-flame',
    ipynb: 'codicon-book',
  };
  return icons[ext] || 'codicon-file';
}
