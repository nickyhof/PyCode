/**
 * PackagesPanel — install and view Python packages via Pyodide.
 */

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { installPackage } from '../../services/pyodide';

export function PackagesPanel() {
  const { state, dispatch, addWorkerListener } = useApp();
  const [pkgName, setPkgName] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Listen for install results from worker
  useEffect(() => {
    const removeListener = addWorkerListener((msgType: string, data: unknown) => {
      if (msgType === 'stdout' && typeof data === 'string' && data.startsWith('Successfully installed ')) {
        const pkg = data.replace('Successfully installed ', '').trim();
        dispatch({ type: 'ADD_PACKAGE', pkg });
        setInstalling(null);
        setPkgName('');
        setStatusMsg(`✓ Installed ${pkg}`);
        setTimeout(() => setStatusMsg(null), 3000);
      }
      if (msgType === 'stderr' && typeof data === 'string' && data.startsWith('Failed to install ')) {
        setInstalling(null);
        setStatusMsg(`✗ ${data}`);
        setTimeout(() => setStatusMsg(null), 5000);
      }
    });
    return removeListener;
  }, [addWorkerListener, dispatch]);

  const handleInstall = useCallback(() => {
    const name = pkgName.trim();
    if (!name || !state.pyodideReady) return;
    setInstalling(name);
    setStatusMsg(null);
    installPackage(name);
  }, [pkgName, state.pyodideReady]);

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">PACKAGES</span>
      </div>
      <div className="sidebar-body">
        <div className="package-installer">
          <p className="package-info">Install Python packages via micropip</p>
          <div className="package-input-row">
            <input
              type="text"
              className="search-box"
              placeholder="Package name..."
              value={pkgName}
              onChange={(e) => setPkgName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleInstall(); }}
              disabled={!state.pyodideReady || installing !== null}
            />
            <button
              className="small-btn"
              onClick={handleInstall}
              disabled={!state.pyodideReady || !pkgName.trim() || installing !== null}
            >
              {installing ? 'Installing...' : 'Install'}
            </button>
          </div>
          {!state.pyodideReady && (
            <p style={{ color: 'var(--fg-warning)', fontSize: 11, marginTop: 6 }}>
              <span className="codicon codicon-loading codicon-modifier-spin" /> Waiting for Python to load...
            </p>
          )}
          {statusMsg && (
            <p style={{
              fontSize: 11,
              marginTop: 6,
              color: statusMsg.startsWith('✓') ? 'var(--fg-success, #89d185)' : 'var(--fg-error, #f48771)',
            }}>
              {statusMsg}
            </p>
          )}
          <div className="installed-list">
            {state.installedPackages.length === 0 ? (
              <div style={{ color: 'var(--fg-muted)', fontSize: 11, padding: '8px 0' }}>
                No packages installed yet
              </div>
            ) : (
              state.installedPackages.map((pkg) => (
                <div key={pkg} className="installed-pkg">
                  <span className="codicon codicon-package" />
                  {pkg}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-primary)', margin: '12px 0', padding: '12px 12px 0' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-secondary)', fontWeight: 600, marginBottom: 8, letterSpacing: '0.5px' }}>
            BUILT-IN
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 12 }}>
            <span className="codicon codicon-copilot" /> Copilot — Enabled
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span className="codicon codicon-symbol-method" style={{ color: '#519aba' }} /> Python — Built-in
          </div>
        </div>
      </div>
    </>
  );
}
