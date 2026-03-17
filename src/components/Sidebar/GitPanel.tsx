/**
 * GitPanel — Source Control sidebar with staging, commits, and history.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useNotification } from '../Notification/Notification';
import {
  initGit,
  gitStatus,
  gitAdd,
  gitAddAll,
  gitUnstage,
  gitDiscardFile,
  gitCommit,
  gitLog,
  gitDiff,
  gitPush,
  gitPull,
  cloneRepo,
  syncVfsToGitFS,
  syncGitFSToVfs,
  gitAddRemote,
  gitGetRemoteUrl,
  type GitStatusEntry,
  type GitLogEntry,
} from '../../services/git';
import { useDialog } from '../Dialog/Dialog';

function statusLetter(status: string): { letter: string; cls: string } {
  switch (status) {
    case 'modified': case 'staged': case 'staged-modified':
      return { letter: 'M', cls: 'status-M' };
    case 'added': case 'added-modified':
      return { letter: 'A', cls: 'status-A' };
    case 'deleted': case 'deleted-staged':
      return { letter: 'D', cls: 'status-D' };
    case 'untracked':
      return { letter: 'U', cls: 'status-U' };
    default:
      return { letter: '?', cls: '' };
  }
}

export function GitPanel() {
  const { state, vfs, dispatch } = useApp();
  const { notify } = useNotification();
  const { prompt } = useDialog();
  const [commitMsg, setCommitMsg] = useState('');
  const [staged, setStaged] = useState<GitStatusEntry[]>([]);
  const [changes, setChanges] = useState<GitStatusEntry[]>([]);
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState({ staged: true, changes: true, log: true });

  const refresh = useCallback(async () => {
    try {
      await syncVfsToGitFS(() => vfs.getAllFiles());
      const statusList = await gitStatus();
      setStaged(statusList.filter((e) =>
        ['added', 'staged', 'staged-modified', 'deleted-staged'].includes(e.status)
      ));
      setChanges(statusList.filter((e) =>
        ['modified', 'untracked', 'added-modified', 'deleted'].includes(e.status)
      ));

      // Update git status in app state
      const statusMap: Record<string, string> = {};
      for (const e of statusList) statusMap[e.filepath] = e.status;
      dispatch({ type: 'SET_GIT_STATUS', statusMap });

      const commits = await gitLog(20);
      setLog(commits);
    } catch (err) {
      console.warn('Git refresh error:', err);
    }
  }, [vfs, dispatch]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await initGit(() => vfs.getAllFiles());
      const url = await gitGetRemoteUrl();
      setRemoteUrl(url);
      await refresh();
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh when VFS changes (debounced)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refresh();
    }, 500);
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.vfsVersion]);

  const handleStageFile = useCallback(async (filepath: string) => {
    await syncVfsToGitFS(() => vfs.getAllFiles());
    await gitAdd(filepath);
    await refresh();
  }, [vfs, refresh]);

  const handleUnstageFile = useCallback(async (filepath: string) => {
    await gitUnstage(filepath);
    await refresh();
  }, [refresh]);

  const handleStageAll = useCallback(async () => {
    await gitAddAll(() => vfs.getAllFiles());
    await refresh();
  }, [vfs, refresh]);

  const handleDiscardFile = useCallback(async (filepath: string) => {
    const restored = await gitDiscardFile(filepath);
    if (restored !== null) {
      // Restore the file content in VFS
      vfs.set(filepath, restored);
    } else {
      // File was untracked — remove from VFS
      vfs.delete(filepath);
    }
    dispatch({ type: 'VFS_CHANGED' });
    await refresh();
  }, [vfs, dispatch, refresh]);

  const handleDiffFile = useCallback(async (filepath: string) => {
    const { oldContent, newContent } = await gitDiff(filepath);
    dispatch({ type: 'OPEN_DIFF', filepath, oldContent, newContent });
  }, [dispatch]);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return;
    try {
      await gitCommit(commitMsg.trim());
      setCommitMsg('');
      await refresh();
    } catch (err) {
      console.error('Commit failed:', err);
    }
  }, [commitMsg, refresh]);

  const handlePush = useCallback(async () => {
    const pat = localStorage.getItem('github-pat');
    if (!pat) {
      notify('Set GitHub token in Settings before pushing', 'error');
      return;
    }
    setSyncing(true);
    try {
      await gitPush(pat);
      notify('Push complete!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`Push failed: ${msg}`, 'error');
    }
    setSyncing(false);
  }, [notify]);

  const handlePull = useCallback(async () => {
    const pat = localStorage.getItem('github-pat') || undefined;
    setSyncing(true);
    try {
      await gitPull(pat);
      await syncGitFSToVfs(
        (path, content) => vfs.set(path, content),
        () => { /* don't clear */ }
      );
      dispatch({ type: 'VFS_CHANGED' });
      await refresh();
      notify('Pull complete!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`Pull failed: ${msg}`, 'error');
    }
    setSyncing(false);
  }, [vfs, dispatch, refresh, notify]);

  const handleClone = useCallback(async () => {
    const url = await prompt({ title: 'Clone Repository', placeholder: 'https://github.com/user/repo.git', defaultValue: '' });
    if (!url) return;
    setSyncing(true);
    try {
      const pat = localStorage.getItem('github-pat');
      // Add auth to URL if PAT available and it's a GitHub URL
      let cloneUrl = url;
      if (pat && url.includes('github.com')) {
        cloneUrl = url.replace('https://', `https://${pat}@`);
      }
      await cloneRepo(cloneUrl);
      await syncGitFSToVfs(
        (path, content) => vfs.set(path, content),
        () => { /* don't clear */ }
      );
      dispatch({ type: 'VFS_CHANGED' });
      const remote = await gitGetRemoteUrl();
      setRemoteUrl(remote);
      await refresh();
      notify('Clone complete!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`Clone failed: ${msg}`, 'error');
    }
    setSyncing(false);
  }, [vfs, dispatch, refresh, notify, prompt]);

  const handleSetRemote = useCallback(async () => {
    const current = remoteUrl || '';
    const url = await prompt({ title: 'Set Remote URL (origin)', placeholder: 'https://github.com/user/repo.git', defaultValue: current });
    if (!url) return;
    try {
      await gitAddRemote('origin', url);
      setRemoteUrl(url);
      notify('Remote URL set!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`Failed to set remote: ${msg}`, 'error');
    }
  }, [remoteUrl, notify, prompt]);

  const toggleSection = useCallback((section: 'staged' | 'changes' | 'log') => {
    setSectionsOpen((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  if (loading) {
    return (
      <>
        <div className="sidebar-header">
          <span className="sidebar-title">SOURCE CONTROL</span>
        </div>
        <div className="sidebar-body" style={{ padding: '12px', color: 'var(--fg-secondary)' }}>
          <span className="codicon codicon-loading codicon-modifier-spin" /> Initializing Git...
        </div>
      </>
    );
  }

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">SOURCE CONTROL</span>
        <div className="sidebar-actions">
          <button className="icon-btn" title="Clone Repository" onClick={handleClone} disabled={syncing}>
            <span className="codicon codicon-repo-clone" />
          </button>
          <button className="icon-btn" title="Set Remote URL" onClick={handleSetRemote}>
            <span className="codicon codicon-remote" />
          </button>
          <button className="icon-btn" title="Refresh" onClick={refresh}>
            <span className="codicon codicon-refresh" />
          </button>
        </div>
      </div>
      <div className="sidebar-body">
        <div className="git-panel">
          {/* Commit input */}
          <div className="git-commit-area">
            <div className="git-input-row">
              <input
                type="text"
                className="git-commit-input"
                placeholder="Commit message"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCommit(); }}
              />
              <button
                className="git-commit-btn"
                title="Commit"
                onClick={handleCommit}
                disabled={!commitMsg.trim() || staged.length === 0}
              >
                <span className="codicon codicon-check" />
              </button>
            </div>
            <div className="git-action-row">
              <button className="git-action-btn" onClick={handleStageAll}>
                Stage All
              </button>
              <button className="git-action-btn" onClick={handlePush} disabled={syncing}>
                <span className="codicon codicon-cloud-upload" />
                <span>Push</span>
              </button>
              <button className="git-action-btn" onClick={handlePull} disabled={syncing}>
                <span className="codicon codicon-cloud-download" />
                <span>Pull</span>
              </button>
            </div>
            {remoteUrl && (
              <div className="git-remote-info">
                <span className="codicon codicon-remote" style={{ fontSize: 11, marginRight: 4 }} />
                <span style={{ opacity: 0.7 }}>{remoteUrl}</span>
              </div>
            )}
          </div>

          {/* Staged Changes */}
          <div className="git-section">
            <div className="git-section-header" onClick={() => toggleSection('staged')}>
              <span className={`codicon codicon-chevron-${sectionsOpen.staged ? 'down' : 'right'}`} />
              Staged Changes <span className="git-count">{staged.length}</span>
            </div>
            {sectionsOpen.staged && (
              <div className="git-file-list">
                {staged.length === 0 && (
                  <div style={{ padding: '4px 12px', color: 'var(--fg-muted)', fontSize: 11 }}>
                    No staged changes
                  </div>
                )}
                {staged.map((entry) => {
                  const { letter, cls } = statusLetter(entry.status);
                  return (
                    <div key={entry.filepath} className="git-file-item">
                      <span className="git-file-name">{entry.filepath}</span>
                      <span className={`git-file-status ${cls}`}>{letter}</span>
                      <div className="git-file-actions">
                        <button className="git-file-action" title="Unstage" onClick={() => handleUnstageFile(entry.filepath)}>
                          <span className="codicon codicon-remove" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Working Changes */}
          <div className="git-section">
            <div className="git-section-header" onClick={() => toggleSection('changes')}>
              <span className={`codicon codicon-chevron-${sectionsOpen.changes ? 'down' : 'right'}`} />
              Changes <span className="git-count">{changes.length}</span>
            </div>
            {sectionsOpen.changes && (
              <div className="git-file-list">
                {changes.length === 0 && (
                  <div style={{ padding: '4px 12px', color: 'var(--fg-muted)', fontSize: 11 }}>
                    No changes
                  </div>
                )}
                {changes.map((entry) => {
                  const { letter, cls } = statusLetter(entry.status);
                  return (
                    <div key={entry.filepath} className="git-file-item">
                      <span className="git-file-name" onClick={() => handleDiffFile(entry.filepath)} style={{ cursor: 'pointer' }}>{entry.filepath}</span>
                      <span className={`git-file-status ${cls}`}>{letter}</span>
                      <div className="git-file-actions">
                        <button className="git-file-action" title="Discard Changes" onClick={() => handleDiscardFile(entry.filepath)}>
                          <span className="codicon codicon-discard" />
                        </button>
                        <button className="git-file-action" title="Stage" onClick={() => handleStageFile(entry.filepath)}>
                          <span className="codicon codicon-add" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Commit History */}
          <div className="git-section">
            <div className="git-section-header" onClick={() => toggleSection('log')}>
              <span className={`codicon codicon-chevron-${sectionsOpen.log ? 'down' : 'right'}`} />
              Commit History
            </div>
            {sectionsOpen.log && (
              <div className="git-log-list">
                {log.length === 0 && (
                  <div style={{ padding: '4px 12px', color: 'var(--fg-muted)', fontSize: 11 }}>
                    No commits yet
                  </div>
                )}
                {log.map((entry) => (
                  <div key={entry.fullSha} className="git-log-item">
                    <div className="git-log-message">{entry.message}</div>
                    <div className="git-log-meta">
                      <span className="git-log-sha">{entry.sha}</span>
                      <span>{entry.author}</span>
                      <span>{entry.dateStr}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
