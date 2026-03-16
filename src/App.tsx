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
  const { state, dispatch } = useApp();
  const { open: openPalette } = useCommandPalette();

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

      <div id="app-shell">
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

