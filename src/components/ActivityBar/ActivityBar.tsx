import type { SidebarPanel } from '../../types';

interface ActivityBarProps {
  activePanel: SidebarPanel;
  onPanelClick: (panel: SidebarPanel) => void;
}

const panels: { id: SidebarPanel; icon: string; title: string }[] = [
  { id: 'explorer', icon: 'codicon-files', title: 'Explorer' },
  { id: 'search', icon: 'codicon-search', title: 'Search' },
  { id: 'git', icon: 'codicon-source-control', title: 'Source Control' },
  { id: 'extensions', icon: 'codicon-extensions', title: 'Extensions' },
];

export function ActivityBar({ activePanel, onPanelClick }: ActivityBarProps) {
  return (
    <div id="activity-bar">
      {panels.map((p) => (
        <button
          key={p.id}
          className={`activity-btn${activePanel === p.id ? ' active' : ''}`}
          title={p.title}
          onClick={() => onPanelClick(p.id)}
        >
          <span className={`codicon ${p.icon}`} />
        </button>
      ))}
      <div className="activity-spacer" />
      <button
        className={`activity-btn${activePanel === 'settings' ? ' active' : ''}`}
        title="Settings"
        onClick={() => onPanelClick('settings')}
      >
        <span className="codicon codicon-settings-gear" />
      </button>
    </div>
  );
}
