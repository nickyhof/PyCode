import { useState, useCallback, useRef } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { TitleBar } from './components/TitleBar/TitleBar';
import { ActivityBar } from './components/ActivityBar/ActivityBar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { EditorArea } from './components/Editor/EditorArea';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { StatusBar } from './components/StatusBar/StatusBar';
import { CopilotPanel } from './components/Copilot/CopilotPanel';
import { NotificationProvider } from './components/Notification/Notification';
import { DialogProvider } from './components/Dialog/Dialog';
import { CommandPaletteProvider, useCommandPalette } from './components/CommandPalette/CommandPalette';
import { useResize } from './hooks/useResize';
import { useKeyboard } from './hooks/useKeyboard';

function AppLayout() {
  const { state, dispatch, vfs } = useApp();
  const { open: openPalette } = useCommandPalette();
  const [dragOver, setDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Drag-to-resize hooks
  useResize({
    handleSelector: '#sidebar-resize',
    targetSelector: '#sidebar',
    direction: 'vertical',
    min: 160,
    max: 500,
  });

  useResize({
    handleSelector: '#panel-resize',
    targetSelector: '#panel',
    direction: 'horizontal',
    min: 80,
    max: 600,
    reverse: true,
  });

  useResize({
    handleSelector: '#copilot-resize',
    targetSelector: '#copilot-panel',
    direction: 'vertical',
    min: 200,
    max: 600,
    reverse: true,
  });

  // Global keyboard shortcuts
  useKeyboard();

  // ─── File Drag & Drop ─────────────────────────────────
  const readFileEntry = useCallback(
    (entry: FileSystemEntry, basePath: string): Promise<void> => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          (entry as FileSystemFileEntry).file((file) => {
            const reader = new FileReader();
            reader.onload = () => {
              const content = reader.result as string;
              const path = basePath + entry.name;
              vfs.set(path, content);
              resolve();
            };
            reader.onerror = () => resolve();
            reader.readAsText(file);
          });
        } else if (entry.isDirectory) {
          const dirReader = (entry as FileSystemDirectoryEntry).createReader();
          dirReader.readEntries(async (entries) => {
            for (const child of entries) {
              await readFileEntry(child, basePath + entry.name + '/');
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    },
    [vfs]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setDragOver(false);

      const items = e.dataTransfer.items;
      if (!items || items.length === 0) return;

      // Use webkitGetAsEntry for folder support
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }

      if (entries.length > 0) {
        for (const entry of entries) {
          await readFileEntry(entry, '');
        }
      } else {
        // Fallback: read as files
        const files = e.dataTransfer.files;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const text = await file.text();
          vfs.set(file.name, text);
        }
      }

      dispatch({ type: 'VFS_CHANGED' });
    },
    [vfs, dispatch, readFileEntry]
  );

  const activeFilename = state.activeTab
    ? state.activeTab.split('/').pop() || 'Welcome'
    : 'Welcome';

  return (
    <>
      <TitleBar
        filename={activeFilename}
        onToggleTerminal={() => dispatch({ type: 'TOGGLE_PANEL' })}
        onToggleCopilot={() => dispatch({ type: 'TOGGLE_COPILOT' })}
        onOpenPalette={openPalette}
      />

      <div
        id="app-shell"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ActivityBar
          activePanel={state.sidebarPanel}
          onPanelClick={(panel) => dispatch({ type: 'SET_SIDEBAR_PANEL', panel })}
        />

        <aside
          id="sidebar"
          className={state.sidebarCollapsed ? 'collapsed' : ''}
        >
          <Sidebar activePanel={state.sidebarPanel} />
        </aside>

        <div className="resize-handle vertical" id="sidebar-resize" />

        <div id="main-content">
          <EditorArea />

          <div className="resize-handle horizontal" id="panel-resize" />

          <TerminalPanel
            collapsed={state.panelCollapsed}
            onToggle={() => dispatch({ type: 'TOGGLE_PANEL' })}
          />
        </div>

        {state.copilotOpen && (
          <>
            <div className="resize-handle vertical" id="copilot-resize" />
            <CopilotPanel onClose={() => dispatch({ type: 'TOGGLE_COPILOT' })} />
          </>
        )}

        {/* Drag-drop overlay */}
        {dragOver && (
          <div className="drop-overlay">
            <div className="drop-overlay-content">
              <span className="codicon codicon-cloud-upload" style={{ fontSize: 48 }} />
              <span>Drop files or folders to upload</span>
            </div>
          </div>
        )}
      </div>

      <StatusBar />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NotificationProvider>
        <DialogProvider>
          <CommandPaletteProvider>
            <AppLayout />
          </CommandPaletteProvider>
        </DialogProvider>
      </NotificationProvider>
    </AppProvider>
  );
}

