/**
 * useKeyboard — global keyboard shortcut handler.
 */

import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

export function useKeyboard() {
  const { state, dispatch, vfs } = useApp();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+N — New File
      if (ctrl && e.key === 'n') {
        e.preventDefault();
        const name = prompt('New file name:', 'untitled.py');
        if (!name) return;
        vfs.set(name, '');
        dispatch({ type: 'VFS_CHANGED' });
        dispatch({ type: 'OPEN_FILE', path: name });
      }

      // Ctrl+S — Mark file as saved (clear dirty flag)
      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (state.activeTab) {
          dispatch({ type: 'MARK_DIRTY', path: state.activeTab, dirty: false });
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

      // F5 — Run (placeholder)
      if (e.key === 'F5') {
        e.preventDefault();
        // Could trigger python execution
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
  }, [state, dispatch, vfs]);
}
