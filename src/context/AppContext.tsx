/**
 * AppContext — global application state for PyCode.
 * Holds VFS, tabs, settings, and provides actions.
 */

import { createContext, useContext, useReducer, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { VirtualFileSystem } from '../services/vfs';
import { initPyodideWorker, postToWorker } from '../services/pyodide';
import type { Tab, SidebarPanel, AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

// ─── State ──────────────────────────────────────────────

interface DiffView {
  filepath: string;
  oldContent: string;
  newContent: string;
}

interface AppState {
  tabs: Tab[];
  activeTab: string | null;
  expandedDirs: Set<string>;
  sidebarPanel: SidebarPanel;
  sidebarCollapsed: boolean;
  panelCollapsed: boolean;
  copilotOpen: boolean;
  pyodideReady: boolean;
  settings: AppSettings;
  gitStatusMap: Record<string, string>;
  installedPackages: string[];
  vfsVersion: number;
  cursorLine: number;
  cursorCol: number;
  diffView: DiffView | null;
}

const initialState: AppState = {
  tabs: [],
  activeTab: null,
  expandedDirs: new Set<string>(),
  sidebarPanel: 'explorer',
  sidebarCollapsed: false,
  panelCollapsed: false,
  copilotOpen: true,
  pyodideReady: false,
  settings: loadSettings(),
  gitStatusMap: {},
  installedPackages: [],
  vfsVersion: 0,
  cursorLine: 1,
  cursorCol: 1,
  diffView: null,
};

// ─── Actions ────────────────────────────────────────────

type Action =
  | { type: 'OPEN_FILE'; path: string }
  | { type: 'CLOSE_TAB'; path: string }
  | { type: 'SET_ACTIVE_TAB'; path: string | null }
  | { type: 'MARK_DIRTY'; path: string; dirty: boolean }
  | { type: 'TOGGLE_DIR'; path: string }
  | { type: 'SET_SIDEBAR_PANEL'; panel: SidebarPanel }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'TOGGLE_PANEL' }
  | { type: 'TOGGLE_COPILOT' }
  | { type: 'SET_PYODIDE_READY'; ready: boolean }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<AppSettings> }
  | { type: 'SET_GIT_STATUS'; statusMap: Record<string, string> }
  | { type: 'ADD_PACKAGE'; pkg: string }
  | { type: 'RENAME_TAB'; oldPath: string; newPath: string }
  | { type: 'VFS_CHANGED' }
  | { type: 'SET_CURSOR'; line: number; col: number }
  | { type: 'OPEN_DIFF'; filepath: string; oldContent: string; newContent: string }
  | { type: 'CLOSE_DIFF' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'OPEN_FILE': {
      const exists = state.tabs.some((t) => t.path === action.path);
      const tabs = exists ? state.tabs : [...state.tabs, { path: action.path, isDirty: false }];
      return { ...state, tabs, activeTab: action.path };
    }
    case 'CLOSE_TAB': {
      const tabs = state.tabs.filter((t) => t.path !== action.path);
      let activeTab = state.activeTab;
      if (activeTab === action.path) {
        activeTab = tabs.length > 0 ? tabs[tabs.length - 1].path : null;
      }
      return { ...state, tabs, activeTab };
    }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.path };
    case 'MARK_DIRTY':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.path === action.path ? { ...t, isDirty: action.dirty } : t,
        ),
      };
    case 'TOGGLE_DIR': {
      const expanded = new Set(state.expandedDirs);
      if (expanded.has(action.path)) expanded.delete(action.path);
      else expanded.add(action.path);
      return { ...state, expandedDirs: expanded };
    }
    case 'SET_SIDEBAR_PANEL': {
      if (state.sidebarPanel === action.panel && !state.sidebarCollapsed) {
        return { ...state, sidebarCollapsed: true };
      }
      return { ...state, sidebarPanel: action.panel, sidebarCollapsed: false };
    }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'TOGGLE_PANEL':
      return { ...state, panelCollapsed: !state.panelCollapsed };
    case 'TOGGLE_COPILOT':
      return { ...state, copilotOpen: !state.copilotOpen };
    case 'SET_PYODIDE_READY':
      return { ...state, pyodideReady: action.ready };
    case 'UPDATE_SETTINGS': {
      const settings = { ...state.settings, ...action.settings };
      saveSettings(settings);
      return { ...state, settings };
    }
    case 'SET_GIT_STATUS':
      return { ...state, gitStatusMap: action.statusMap };
    case 'ADD_PACKAGE':
      if (state.installedPackages.includes(action.pkg)) return state;
      return { ...state, installedPackages: [...state.installedPackages, action.pkg] };
    case 'RENAME_TAB':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.path === action.oldPath ? { ...t, path: action.newPath } : t,
        ),
        activeTab: state.activeTab === action.oldPath ? action.newPath : state.activeTab,
      };
    case 'VFS_CHANGED':
      return { ...state, vfsVersion: state.vfsVersion + 1 };
    case 'SET_CURSOR':
      return { ...state, cursorLine: action.line, cursorCol: action.col };
    case 'OPEN_DIFF':
      return { ...state, diffView: { filepath: action.filepath, oldContent: action.oldContent, newContent: action.newContent } };
    case 'CLOSE_DIFF':
      return { ...state, diffView: null };
    default:
      return state;
  }
}

// ─── Settings persistence ───────────────────────────────

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem('pycode-settings');
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: AppSettings): void {
  localStorage.setItem('pycode-settings', JSON.stringify(settings));
  // Also write individual keys for backward compat with git service
  if (settings.gitUserName) localStorage.setItem('git-user-name', settings.gitUserName);
  if (settings.gitUserEmail) localStorage.setItem('git-user-email', settings.gitUserEmail);
  if (settings.githubPat) localStorage.setItem('github-pat', settings.githubPat);
}

// ─── Worker output callback ─────────────────────────────

export type WorkerOutputListener = (msgType: string, data: unknown) => void;

// ─── Context ────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  vfs: VirtualFileSystem;
  addWorkerListener: (listener: WorkerOutputListener) => () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const vfsRef = useRef(new VirtualFileSystem());
  const listenersRef = useRef<Set<WorkerOutputListener>>(new Set());

  const addWorkerListener = useCallback((listener: WorkerOutputListener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  // Initialize VFS, Git, and Pyodide on mount
  useEffect(() => {
    // Load default project files, then init git with initial commit
    (async () => {
      await vfsRef.current.init();
      dispatch({ type: 'VFS_CHANGED' });

      // Init git — this creates the initial commit so files don't show as changes
      const { initGit } = await import('../services/git');
      await initGit(() => vfsRef.current.getAllFiles(), undefined, true);
    })();

    // Start the Pyodide web worker (independent of VFS/Git)
    initPyodideWorker((type, data) => {
      if (type === 'ready') {
        dispatch({ type: 'SET_PYODIDE_READY', ready: true });
      }
      // Forward all messages to listeners (terminal, etc.)
      for (const listener of listenersRef.current) {
        listener(type, data);
      }
    });
    postToWorker('init');
  }, []);

  const value: AppContextValue = {
    state,
    dispatch,
    vfs: vfsRef.current,
    addWorkerListener,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export type { AppState, Action };

