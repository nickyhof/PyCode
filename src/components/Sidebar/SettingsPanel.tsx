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
      <div className="sidebar-body" style={{ padding: 0 }}>
        <h3 className="settings-section-title">Editor</h3>

        <label className="setting-item">
          <span className="setting-label">Font Size</span>
          <span className="setting-desc">Controls the font size in pixels for the editor</span>
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
          <span className="setting-desc">Number of spaces per indentation level</span>
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
          <span className="setting-desc">Controls whether lines should wrap at the viewport width</span>
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
          <span className="setting-desc">Show a minimap overview of the file on the right side</span>
          <select
            className="setting-input"
            value={settings.minimap ? 'on' : 'off'}
            onChange={(e) => update({ minimap: e.target.value === 'on' })}
          >
            <option value="on">Visible</option>
            <option value="off">Hidden</option>
          </select>
        </label>

        <div className="settings-divider" />
        <h3 className="settings-section-title">Git</h3>

        <label className="setting-item">
          <span className="setting-label">User Name</span>
          <span className="setting-desc">Name used for Git commits</span>
          <input
            type="text"
            className="setting-input"
            style={{ maxWidth: '100%' }}
            value={settings.gitUserName}
            placeholder="Your Name"
            onChange={(e) => update({ gitUserName: e.target.value })}
          />
        </label>

        <label className="setting-item">
          <span className="setting-label">User Email</span>
          <span className="setting-desc">Email used for Git commits</span>
          <input
            type="text"
            className="setting-input"
            style={{ maxWidth: '100%' }}
            value={settings.gitUserEmail}
            placeholder="you@example.com"
            onChange={(e) => update({ gitUserEmail: e.target.value })}
          />
        </label>

        <label className="setting-item">
          <span className="setting-label">GitHub Token</span>
          <span className="setting-desc">Personal access token for push/pull operations</span>
          <input
            type="password"
            className="setting-input"
            style={{ maxWidth: '100%' }}
            value={settings.githubPat}
            placeholder="ghp_..."
            onChange={(e) => update({ githubPat: e.target.value })}
          />
        </label>

        <div className="settings-divider" />
        <h3 className="settings-section-title">Copilot</h3>

        <label className="setting-item">
          <span className="setting-label">Model</span>
          <span className="setting-desc">AI model used for Copilot chat and suggestions</span>
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
          <span className="setting-desc">Show AI-powered inline code completions while typing</span>
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
