import { useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useDialog } from '../components/Dialog/Dialog';
import { syncFilesToWorker, runPythonFile } from '../services/pyodide';

export function useKeyboard() {
  const { state, dispatch, vfs } = useApp();
  const { prompt } = useDialog();

  const handleNewFile = useCallback(async () => {
    const name = await prompt({ title: 'New File', defaultValue: 'untitled.py', placeholder: 'Enter file name...' });
    if (!name) return;
    vfs.set(name, '');
    dispatch({ type: 'VFS_CHANGED' });
    dispatch({ type: 'OPEN_FILE', path: name });
  }, [prompt, vfs, dispatch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+N — New File
      if (ctrl && e.key === 'n') {
        e.preventDefault();
        handleNewFile();
      }

      // Ctrl+S — Save file (persist to VFS and clear dirty flag)
      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (state.activeTab) {
          // Content is already synced to VFS via onChange handler,
          // just mark the tab as saved
          dispatch({ type: 'MARK_DIRTY', path: state.activeTab, dirty: false });
          dispatch({ type: 'VFS_CHANGED' });
        }
      }

      // Ctrl+W — Close active tab
      if (ctrl && e.key === 'w') {
        e.preventDefault();
        if (state.activeTab) {
          dispatch({ type: 'CLOSE_TAB', path: state.activeTab });
        }
      }

      // Ctrl+` — Toggle terminal
      if (ctrl && e.key === '`') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_PANEL' });
      }

      // Ctrl+B — Toggle sidebar
      if (ctrl && e.key === 'b') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_SIDEBAR' });
      }

      // F5 — Run active Python file
      if (e.key === 'F5') {
        e.preventDefault();
        const file = state.activeTab || 'main.py';
        if (!state.pyodideReady) return;
        // Ensure terminal is visible
        if (state.panelCollapsed) {
          dispatch({ type: 'TOGGLE_PANEL' });
        }
        // Sync VFS files and run
        const files = vfs.getAllFiles();
        syncFilesToWorker(files);
        setTimeout(() => runPythonFile(file), 50);
      }

      // Ctrl+Shift+E — Explorer
      if (ctrl && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'explorer' });
      }

      // Ctrl+Shift+F — Search
      if (ctrl && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'search' });
      }

      // Ctrl+Shift+G — Git
      if (ctrl && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'git' });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, dispatch, vfs, handleNewFile]);
}
