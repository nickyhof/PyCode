import { useApp } from '../../context/AppContext';

export function SettingsPanel() {
  const { state, dispatch } = useApp();
  const { settings } = state;

  const update = (partial: Partial<typeof settings>) =>
    dispatch({ type: 'UPDATE_SETTINGS', settings: partial });

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">SETTINGS</span>
      </div>
      <div className="sidebar-body" style={{ padding: '8px 0' }}>
        <h3 className="settings-section-title">Editor</h3>

        <label className="setting-item">
          <span className="setting-label">Font Size</span>
          <select
            className="setting-input"
            value={settings.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
          >
            {[12, 13, 14, 15, 16, 18, 20].map((s) => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>
        </label>

        <label className="setting-item">
          <span className="setting-label">Tab Size</span>
          <select
            className="setting-input"
            value={settings.tabSize}
            onChange={(e) => update({ tabSize: Number(e.target.value) })}
          >
            {[2, 4, 8].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label className="setting-item">
          <span className="setting-label">Word Wrap</span>
          <select
            className="setting-input"
            value={settings.wordWrap ? 'on' : 'off'}
            onChange={(e) => update({ wordWrap: e.target.value === 'on' })}
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>

        <label className="setting-item">
          <span className="setting-label">Minimap</span>
          <select
            className="setting-input"
            value={settings.minimap ? 'on' : 'off'}
            onChange={(e) => update({ minimap: e.target.value === 'on' })}
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>

        <div className="settings-divider" />
        <h3 className="settings-section-title">Git</h3>

        <label className="setting-item">
          <span className="setting-label">User Name</span>
          <input
            type="text"
            className="setting-input"
            value={settings.gitUserName}
            placeholder="Your Name"
            onChange={(e) => update({ gitUserName: e.target.value })}
          />
        </label>

        <label className="setting-item">
          <span className="setting-label">User Email</span>
          <input
            type="text"
            className="setting-input"
            value={settings.gitUserEmail}
            placeholder="you@example.com"
            onChange={(e) => update({ gitUserEmail: e.target.value })}
          />
        </label>

        <label className="setting-item">
          <span className="setting-label">GitHub Token</span>
          <input
            type="password"
            className="setting-input"
            value={settings.githubPat}
            placeholder="ghp_..."
            onChange={(e) => update({ githubPat: e.target.value })}
          />
        </label>

        <div className="settings-divider" />
        <h3 className="settings-section-title">Copilot</h3>

        <label className="setting-item">
          <span className="setting-label">Model</span>
          <select
            className="setting-input"
            value={settings.copilotModel}
            onChange={(e) => update({ copilotModel: e.target.value })}
          >
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="o3-mini">o3-mini</option>
          </select>
        </label>

        <label className="setting-item">
          <span className="setting-label">Inline Suggestions</span>
          <select
            className="setting-input"
            value={settings.copilotInlineEnabled ? 'on' : 'off'}
            onChange={(e) => update({ copilotInlineEnabled: e.target.value === 'on' })}
          >
            <option value="on">Enabled</option>
            <option value="off">Disabled</option>
          </select>
        </label>
      </div>
    </>
  );
}
