/**
 * TerminalPanel — xterm.js terminal with command handling.
 * Commands like `python`, `pip`, `uv`, `git` execute via Pyodide/isomorphic-git.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useApp } from '../../context/AppContext';
import { syncFilesToWorker, runPythonFile, runPythonCode, installPackage } from '../../services/pyodide';
import { startServer, stopServer } from '../../services/webServer';
import * as Git from '../../services/git';

interface TerminalPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function TerminalPanel({ collapsed, onToggle }: TerminalPanelProps) {
  const { state, vfs, dispatch, addWorkerListener } = useApp();
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cmdBufRef = useRef('');
  const handleCommandRef = useRef<(cmd: string) => void>(() => {});
  const runningRef = useRef(false);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const savedCmdRef = useRef('');
  const inputBufferRef = useRef<SharedArrayBuffer | null>(null);
  const [plotImages, setPlotImages] = useState<string[]>([]);
  const [activePanel, setActivePanel] = useState<'terminal' | 'preview'>('terminal');
  const [previewUrl, setPreviewUrl] = useState('/pycode-server/');
  const [serverActive, setServerActive] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);

  const writePrompt = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.write('\r\n\x1b[36m❯\x1b[0m ');
  }, []);

  const syncAndRun = useCallback((fn: () => void) => {
    const files = vfs.getAllFiles();
    syncFilesToWorker(files);
    setTimeout(fn, 50);
  }, [vfs]);

  // ─── Git Terminal Commands ──────────────────────────────

  const handleGitCommand = useCallback(async (cmd: string, term: Terminal) => {
    const parts = cmd.split(/\s+/);
    const sub = parts[1];

    // Clone does not require git to be initialized
    if (sub === 'clone') {
      const url = parts[2];
      if (!url) {
        term.write('\r\n\x1b[33mUsage: git clone <url>\x1b[0m');
        return;
      }
      term.write(`\r\n\x1b[90m$ git clone ${url}\x1b[0m`);
      term.write('\r\nCloning...');
      try {
        await Git.cloneRepo(url, (msg) => {
          term.write(`\r\n\x1b[90m${msg}\x1b[0m`);
        });
        // Sync cloned files to VFS
        await Git.syncGitFSToVfs(
          (path, content) => vfs.set(path, content),
          () => { /* don't clear VFS */ }
        );
        dispatch({ type: 'VFS_CHANGED' });
        term.write('\r\n\x1b[32mClone complete!\x1b[0m');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        term.write(`\r\n\x1b[31mClone failed: ${msg}\x1b[0m`);
      }
      return;
    }

    if (!Git.isGitReady()) {
      // Auto-init git if not ready
      try {
        await Git.initGit(() => vfs.getAllFiles());
      } catch {
        term.write('\r\n\x1b[31mGit is not initialized.\x1b[0m');
        return;
      }
    }

    try {
      switch (sub) {
        case 'status': {
          const statusList = await Git.gitStatus();
          if (statusList.length === 0) {
            term.write('\r\n\x1b[32mNothing to commit, working tree clean\x1b[0m');
          } else {
            const branch = await Git.gitCurrentBranch();
            term.write(`\r\nOn branch \x1b[36m${branch}\x1b[0m`);
            const staged = statusList.filter(s => s.status.includes('staged') || s.status === 'added');
            const unstaged = statusList.filter(s => ['modified', 'deleted', '*modified', 'untracked', '*deleted', '*added'].includes(s.status));
            if (staged.length > 0) {
              term.write('\r\n\x1b[32mChanges to be committed:\x1b[0m');
              for (const s of staged) {
                term.write(`\r\n  \x1b[32m${s.status}:\x1b[0m   ${s.filepath}`);
              }
            }
            if (unstaged.length > 0) {
              term.write('\r\n\x1b[31mChanges not staged for commit:\x1b[0m');
              for (const s of unstaged) {
                term.write(`\r\n  \x1b[31m${s.status}:\x1b[0m   ${s.filepath}`);
              }
            }
          }
          break;
        }

        case 'add': {
          const target = parts.slice(2).join(' ').trim();
          if (target === '.' || target === '--all' || target === '-A') {
            await Git.gitAddAll(() => vfs.getAllFiles());
            term.write('\r\n\x1b[32mAll changes staged.\x1b[0m');
          } else if (target) {
            await Git.syncVfsToGitFS(() => vfs.getAllFiles());
            await Git.gitAdd(target);
            term.write(`\r\n\x1b[32mStaged: ${target}\x1b[0m`);
          } else {
            term.write('\r\n\x1b[33mUsage: git add <file> or git add .\x1b[0m');
          }
          break;
        }

        case 'commit': {
          let msg = '';
          const mIdx = parts.indexOf('-m');
          if (mIdx !== -1) {
            msg = cmd.slice(cmd.indexOf('-m') + 2).trim();
            if ((msg.startsWith('"') && msg.endsWith('"')) || (msg.startsWith("'") && msg.endsWith("'"))) {
              msg = msg.slice(1, -1);
            }
          }
          if (!msg) {
            term.write('\r\n\x1b[33mUsage: git commit -m "your message"\x1b[0m');
          } else {
            const sha = await Git.gitCommit(msg);
            if (sha) {
              const branch = await Git.gitCurrentBranch();
              term.write(`\r\n\x1b[32m[${branch} ${sha.slice(0, 7)}] ${msg}\x1b[0m`);
            }
          }
          break;
        }

        case 'log': {
          const commits = await Git.gitLog(15);
          for (const c of commits) {
            term.write(`\r\n\x1b[33m${c.sha}\x1b[0m ${c.message.trim()} \x1b[90m(${c.dateStr})\x1b[0m`);
          }
          if (commits.length === 0) {
            term.write('\r\n\x1b[90mNo commits yet.\x1b[0m');
          }
          break;
        }

        case 'branch': {
          if (parts[2]) {
            await Git.gitCreateBranch(parts[2]);
            term.write(`\r\n\x1b[32mCreated branch: ${parts[2]}\x1b[0m`);
          } else {
            const branches = await Git.gitListBranches();
            const current = await Git.gitCurrentBranch();
            for (const b of branches) {
              const marker = b === current ? '\x1b[32m* ' : '  ';
              term.write(`\r\n${marker}${b}\x1b[0m`);
            }
          }
          break;
        }

        case 'checkout': {
          if (parts[2] === '-b' && parts[3]) {
            await Git.gitCreateBranch(parts[3]);
            await Git.gitCheckout(parts[3]);
            term.write(`\r\n\x1b[32mSwitched to new branch '${parts[3]}'\x1b[0m`);
          } else if (parts[2]) {
            await Git.gitCheckout(parts[2]);
            term.write(`\r\n\x1b[32mSwitched to branch '${parts[2]}'\x1b[0m`);
            // Sync files from new branch back to VFS
            await Git.syncGitFSToVfs(
              (path, content) => vfs.set(path, content),
              () => { /* clear handled separately */ }
            );
            dispatch({ type: 'VFS_CHANGED' });
          } else {
            term.write('\r\n\x1b[33mUsage: git checkout <branch>\x1b[0m');
          }
          break;
        }

        case 'diff': {
          const filepath = parts.slice(2).join(' ').trim();
          if (!filepath) {
            term.write('\r\n\x1b[33mUsage: git diff <file>\x1b[0m');
          } else {
            const d = await Git.gitDiff(filepath);
            if (d.oldContent === d.newContent) {
              term.write(`\r\n\x1b[90mNo changes in ${filepath}\x1b[0m`);
            } else {
              const oldLines = d.oldContent.split('\n');
              const newLines = d.newContent.split('\n');
              term.write(`\r\n\x1b[1mdiff ${filepath}\x1b[0m`);
              term.write(`\r\n\x1b[36m--- a/${filepath}\x1b[0m`);
              term.write(`\r\n\x1b[36m+++ b/${filepath}\x1b[0m`);
              const maxLen = Math.max(oldLines.length, newLines.length);
              for (let i = 0; i < Math.min(maxLen, 30); i++) {
                const oLine = oldLines[i];
                const nLine = newLines[i];
                if (oLine === undefined) {
                  term.write(`\r\n\x1b[32m+ ${nLine}\x1b[0m`);
                } else if (nLine === undefined) {
                  term.write(`\r\n\x1b[31m- ${oLine}\x1b[0m`);
                } else if (oLine !== nLine) {
                  term.write(`\r\n\x1b[31m- ${oLine}\x1b[0m`);
                  term.write(`\r\n\x1b[32m+ ${nLine}\x1b[0m`);
                }
              }
              if (maxLen > 30) {
                term.write(`\r\n\x1b[90m... (${maxLen - 30} more lines)\x1b[0m`);
              }
            }
          }
          break;
        }

        case 'push': {
          const pat = localStorage.getItem('github-pat');
          if (!pat) {
            term.write('\r\n\x1b[33mSet GitHub token in Settings before pushing\x1b[0m');
            break;
          }
          term.write('\r\n\x1b[90mPushing...\x1b[0m');
          await Git.gitPush(pat, (msg) => {
            term.write(`\r\n\x1b[90m${msg}\x1b[0m`);
          });
          term.write('\r\n\x1b[32mPush complete!\x1b[0m');
          break;
        }

        case 'pull': {
          const pat = localStorage.getItem('github-pat');
          term.write('\r\n\x1b[90mPulling...\x1b[0m');
          await Git.gitPull(pat || undefined, (msg) => {
            term.write(`\r\n\x1b[90m${msg}\x1b[0m`);
          });
          await Git.syncGitFSToVfs(
            (path, content) => vfs.set(path, content),
            () => { /* don't clear */ }
          );
          dispatch({ type: 'VFS_CHANGED' });
          term.write('\r\n\x1b[32mPull complete!\x1b[0m');
          break;
        }

        case 'init': {
          await Git.initGit(() => vfs.getAllFiles());
          term.write('\r\n\x1b[32mInitialized empty Git repository\x1b[0m');
          break;
        }

        case 'reset': {
          const target = parts[2] || '';
          if (!target) {
            term.write('\r\n\x1b[33mUsage: git reset <file> | git reset --hard\x1b[0m');
            break;
          }
          if (target === '--hard') {
            // Reset all tracked files to HEAD
            const statusList = await Git.gitStatus();
            for (const entry of statusList) {
              const restored = await Git.gitResetFile(entry.filepath);
              if (restored !== null) {
                vfs.set(entry.filepath, restored);
              } else {
                vfs.delete(entry.filepath);
              }
            }
            dispatch({ type: 'VFS_CHANGED' });
            term.write('\r\n\x1b[32mHard reset complete\x1b[0m');
          } else {
            // Reset single file
            const restored = await Git.gitResetFile(target);
            if (restored !== null) {
              vfs.set(target, restored);
            } else {
              vfs.delete(target);
            }
            dispatch({ type: 'VFS_CHANGED' });
            term.write(`\r\n\x1b[32mReset ${target}\x1b[0m`);
          }
          break;
        }

        default:
          term.write(`\r\n\x1b[33mUnknown git command: ${sub}\x1b[0m`);
          term.write('\r\n\x1b[90mAvailable: init, clone, status, add, commit, log, branch, checkout, diff, push, pull, reset\x1b[0m');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      term.write(`\r\n\x1b[31mGit error: ${msg}\x1b[0m`);
    }
  }, [vfs, dispatch]);

  // ─── Main Command Handler ──────────────────────────────

  const handleCommand = useCallback((cmd: string) => {
    const term = termRef.current;
    if (!term) return;
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0];

    // Git commands are async — handle separately
    if (command === 'git') {
      runningRef.current = true;
      handleGitCommand(cmd.trim(), term).finally(() => {
        runningRef.current = false;
        writePrompt();
      });
      return;
    }

    switch (command) {
      case '':
        break;
      case 'clear':
        term.clear();
        break;
      case 'ls': {
        const listPath = parts[1] === '-l' ? parts[2] : parts[1];
        const detailed = parts[1] === '-l';
        const tree = vfs.tree();

        // Navigate to subdirectory if specified
        let target = tree;
        if (listPath && listPath !== '-l') {
          const pathParts = listPath.replace(/\/$/, '').split('/');
          for (const p of pathParts) {
            if (target.children[p] && target.children[p].type === 'directory') {
              target = target.children[p] as typeof tree;
            } else {
              term.write(`\r\n\x1b[31mNo such directory: ${listPath}\x1b[0m`);
              break;
            }
          }
        }

        const children = Object.values(target.children || {}).sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        const colorFile = (name: string, type: string) => {
          if (type === 'directory') return `\x1b[1;34m${name}/\x1b[0m`;
          if (name.endsWith('.py')) return `\x1b[32m${name}\x1b[0m`;
          if (name.endsWith('.ipynb')) return `\x1b[35m${name}\x1b[0m`;
          if (name.endsWith('.toml') || name.endsWith('.json') || name.endsWith('.yml') || name.endsWith('.yaml')) return `\x1b[33m${name}\x1b[0m`;
          if (name.endsWith('.md') || name.endsWith('.txt')) return `\x1b[36m${name}\x1b[0m`;
          return name;
        };

        if (detailed) {
          for (const child of children) {
            const entry = vfs.get(child.path);
            const sizeStr = child.type === 'directory' ? '   -' : String(entry?.content?.length ?? 0).padStart(6);
            const typeStr = child.type === 'directory' ? '\x1b[90mdir \x1b[0m' : '\x1b[90mfile\x1b[0m';
            term.write(`\r\n  ${typeStr}  ${sizeStr}  ${colorFile(child.name, child.type)}`);
          }
        } else {
          for (const child of children) {
            term.write(`\r\n  ${colorFile(child.name, child.type)}`);
          }
        }
        break;
      }
      case 'cat': {
        const showLines = parts[1] === '-n';
        const path = showLines ? parts[2] : parts[1];
        if (!path) { term.write('\r\n\x1b[33mUsage: cat [-n] <file>\x1b[0m'); break; }
        const entry = vfs.get(path);
        if (!entry || entry.type !== 'file') {
          term.write(`\r\n\x1b[31mFile not found: ${path}\x1b[0m`);
        } else if (showLines) {
          const lines = (entry.content ?? '').split('\n');
          for (let i = 0; i < lines.length; i++) {
            term.write(`\r\n\x1b[90m${String(i + 1).padStart(4)}\x1b[0m  ${lines[i]}`);
          }
        } else {
          const text = (entry.content ?? '').replace(/\n/g, '\r\n');
          term.write(`\r\n${text}`);
        }
        break;
      }
      case 'python':
      case 'python3': {
        if (!state.pyodideReady) {
          term.write('\r\n\x1b[33m⚠ Python is still loading...\x1b[0m');
          break;
        }
        // python -c "code"
        if (parts[1] === '-c') {
          const codeStr = cmd.trim().replace(/^python3?\s+-c\s+/, '').replace(/^["']|["']$/g, '');
          if (!codeStr) {
            term.write('\r\n\x1b[33mUsage: python -c "code"\x1b[0m');
            break;
          }
          term.write(`\r\n\x1b[90m>>> ${codeStr}\x1b[0m`);
          runningRef.current = true;
          syncAndRun(() => runPythonCode(codeStr));
          return;
        }
        // python (no args) — hint
        const file = parts[1];
        if (!file) {
          term.write('\r\n\x1b[36mPython ' + '3.12 (Pyodide)\x1b[0m');
          term.write('\r\n\x1b[90mUse "exec <code>" or "python -c <code>" to run inline Python\x1b[0m');
          break;
        }
        const pyEntry = vfs.get(file);
        if (!pyEntry || pyEntry.type !== 'file') {
          term.write(`\r\n\x1b[31mFile not found: ${file}\x1b[0m`);
          break;
        }
        term.write(`\r\n\x1b[90m$ python ${file}\x1b[0m`);
        runningRef.current = true;
        syncAndRun(() => runPythonFile(file));
        return;
      }
      case 'pip':
      case 'pip3': {
        const sub = parts[1];
        if (sub === 'install' && parts[2]) {
          if (!state.pyodideReady) {
            term.write('\r\n\x1b[33m⚠ Python is still loading...\x1b[0m');
            break;
          }
          const pkg = parts[2];
          term.write(`\r\n\x1b[90m$ pip install ${pkg}\x1b[0m`);
          runningRef.current = true;
          installPackage(pkg);
          return;
        } else if (sub === 'list') {
          if (state.installedPackages.length === 0) {
            term.write('\r\n\x1b[90mNo packages installed\x1b[0m');
          } else {
            term.write('\r\n\x1b[36mInstalled packages:\x1b[0m');
            for (const p of state.installedPackages) {
              term.write(`\r\n  ${p}`);
            }
          }
          break;
        } else {
          term.write('\r\n\x1b[33mUsage: pip install <pkg> | pip list\x1b[0m');
          break;
        }
      }
      case 'uv': {
        const sub = parts[1];
        if (!sub) {
          term.write('\r\n\x1b[33mUsage: uv init | uv sync | uv run <file> | uv add <pkg> | uv remove <pkg> | uv pip install/list\x1b[0m');
          break;
        }

        if (sub === 'init') {
          term.write('\r\n\x1b[90m$ uv init\x1b[0m');
          const existing = vfs.get('pyproject.toml');
          if (existing && existing.type === 'file') {
            term.write('\r\n\x1b[33mpyproject.toml already exists\x1b[0m');
            break;
          }
          const toml = `[project]\nname = "my-project"\nversion = "0.1.0"\ndescription = ""\nrequires-python = ">=3.11"\ndependencies = []\n`;
          vfs.set('pyproject.toml', toml);
          dispatch({ type: 'VFS_CHANGED' });
          dispatch({ type: 'OPEN_FILE', path: 'pyproject.toml' });
          term.write('\r\n\x1b[32mCreated pyproject.toml\x1b[0m');
          break;
        }

        if (!state.pyodideReady && sub !== 'init') {
          term.write('\r\n\x1b[33m\u26a0 Python is still loading...\x1b[0m');
          break;
        }

        if (sub === 'sync') {
          term.write('\r\n\x1b[90m$ uv sync\x1b[0m');
          const pyproject = vfs.get('pyproject.toml');
          if (!pyproject || pyproject.type !== 'file' || !pyproject.content) {
            term.write('\r\n\x1b[33mNo pyproject.toml found. Run "uv init" first.\x1b[0m');
            break;
          }
          const depMatch = pyproject.content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
          const devMatch = pyproject.content.match(/\[dependency-groups\][\s\S]*?dev\s*=\s*\[([\s\S]*?)\]/);
          const allDeps: string[] = [];
          for (const m of [depMatch, devMatch]) {
            if (m) {
              const found = m[1].match(/"([^"]+)"/g)?.map(d => d.replace(/"/g, '').split(/[><=!~]/)[0].trim()) || [];
              allDeps.push(...found);
            }
          }
          if (allDeps.length > 0) {
            term.write(`\r\n\x1b[90mInstalling ${allDeps.length} dependencies...\x1b[0m`);
            runningRef.current = true;
            for (const dep of allDeps) {
              installPackage(dep);
            }
            return;
          }
          term.write('\r\n\x1b[90mNo dependencies found in pyproject.toml\x1b[0m');
          break;
        } else if (sub === 'run' && parts[2]) {
          const file = parts[2];
          const entry = vfs.get(file);
          if (!entry || entry.type !== 'file') {
            term.write(`\r\n\x1b[31mFile not found: ${file}\x1b[0m`);
            break;
          }
          term.write(`\r\n\x1b[90m$ uv run ${file}\x1b[0m`);
          runningRef.current = true;
          syncAndRun(() => runPythonFile(file));
          return;
        } else if (sub === 'add' && parts[2]) {
          const pkg = parts[2];
          term.write(`\r\n\x1b[90m$ uv add ${pkg}\x1b[0m`);
          // Update pyproject.toml
          const pyproject = vfs.get('pyproject.toml');
          if (pyproject && pyproject.type === 'file' && pyproject.content) {
            const content = pyproject.content;
            const depsMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
            if (depsMatch) {
              const currentDeps = depsMatch[1].match(/"([^"]+)"/g)?.map(d => d.replace(/"/g, '')) || [];
              if (!currentDeps.some(d => d.split(/[><=!~]/)[0].trim() === pkg)) {
                currentDeps.push(pkg);
                const newDeps = currentDeps.map(d => `  "${d}"`).join(',\n');
                const newContent = content.replace(/dependencies\s*=\s*\[([\s\S]*?)\]/, `dependencies = [\n${newDeps},\n]`);
                vfs.set('pyproject.toml', newContent);
                dispatch({ type: 'VFS_CHANGED' });
                term.write(`\r\n\x1b[90mAdded "${pkg}" to pyproject.toml\x1b[0m`);
              } else {
                term.write(`\r\n\x1b[90m"${pkg}" already in dependencies\x1b[0m`);
              }
            }
          } else {
            term.write('\r\n\x1b[33mNo pyproject.toml found. Run "uv init" first.\x1b[0m');
            break;
          }
          // Install the package
          runningRef.current = true;
          installPackage(pkg);
          return;
        } else if (sub === 'remove' && parts[2]) {
          const pkg = parts[2];
          term.write(`\r\n\x1b[90m$ uv remove ${pkg}\x1b[0m`);
          const pyproject = vfs.get('pyproject.toml');
          if (pyproject && pyproject.type === 'file' && pyproject.content) {
            const content = pyproject.content;
            const depsMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
            if (depsMatch) {
              const currentDeps = depsMatch[1].match(/"([^"]+)"/g)?.map(d => d.replace(/"/g, '')) || [];
              const filtered = currentDeps.filter(d => d.split(/[><=!~]/)[0].trim() !== pkg);
              if (filtered.length < currentDeps.length) {
                const newDeps = filtered.length > 0 ? filtered.map(d => `  "${d}"`).join(',\n') + ',\n' : '';
                const newContent = content.replace(/dependencies\s*=\s*\[([\s\S]*?)\]/, `dependencies = [\n${newDeps}]`);
                vfs.set('pyproject.toml', newContent);
                dispatch({ type: 'VFS_CHANGED' });
                term.write(`\r\n\x1b[32mRemoved "${pkg}" from pyproject.toml\x1b[0m`);
              } else {
                term.write(`\r\n\x1b[33m"${pkg}" not found in dependencies\x1b[0m`);
              }
            }
          } else {
            term.write('\r\n\x1b[33mNo pyproject.toml found\x1b[0m');
          }
          break;
        } else if (sub === 'pip') {
          const pipSub = parts[2];
          if (pipSub === 'install' && parts[3]) {
            const pkg = parts[3];
            term.write(`\r\n\x1b[90m$ uv pip install ${pkg}\x1b[0m`);
            runningRef.current = true;
            installPackage(pkg);
            return;
          } else if (pipSub === 'list' || pipSub === 'freeze') {
            term.write(`\r\n\x1b[90m$ uv pip ${pipSub}\x1b[0m`);
            if (state.installedPackages.length === 0) {
              term.write('\r\nNo packages installed');
            } else {
              for (const pkg of state.installedPackages) {
                term.write(`\r\n  \x1b[32m${pkg}\x1b[0m`);
              }
            }
            break;
          } else {
            term.write('\r\n\x1b[33mUsage: uv pip install <pkg> | uv pip list | uv pip freeze\x1b[0m');
            break;
          }
        } else {
          term.write(`\r\n\x1b[90m$ ${cmd}\x1b[0m`);
          term.write('\r\n\x1b[33mUsage: uv init | uv sync | uv run <file> | uv add <pkg> | uv remove <pkg> | uv pip install/list\x1b[0m');
          break;
        }
      }
      case 'bazel': {
        const sub = parts[1];
        if (!sub) {
          term.write('\r\n\x1b[33mUsage: bazel build | query | run | test <target> | clean\x1b[0m');
          break;
        }
        if (!state.pyodideReady) {
          term.write('\r\n\x1b[33m\u26a0 Python is still loading...\x1b[0m');
          break;
        }
        if (sub === 'query') {
          term.write('\r\n\x1b[90m$ bazel query ...\x1b[0m');
          const allFiles = vfs.getAllFiles();
          const buildFiles = Object.keys(allFiles).filter(f => f.endsWith('.bazel') || f === 'BUILD');
          const pyFiles = Object.keys(allFiles).filter(f => f.endsWith('.py'));
          if (buildFiles.length > 0) {
            term.write('\r\n\x1b[36mBUILD files:\x1b[0m');
            for (const f of buildFiles) term.write(`\r\n  ${f}`);
          }
          if (pyFiles.length === 0) {
            term.write('\r\nNo Python targets found');
          } else {
            term.write('\r\n\x1b[36mPython targets:\x1b[0m');
            for (const f of pyFiles) {
              const dir = f.includes('/') ? f.substring(0, f.lastIndexOf('/')) : '';
              const name = f.includes('/') ? f.substring(f.lastIndexOf('/') + 1) : f;
              const label = dir ? `//${dir}:${name.replace('.py', '')}` : `//:${name.replace('.py', '')}`;
              term.write(`\r\n  \x1b[32m${label}\x1b[0m`);
            }
          }
          break;
        } else if (sub === 'build' && parts[2]) {
          const target = parts[2].replace('//', '').replace(':', '/');
          const file = target.endsWith('.py') ? target : target + '.py';
          const entry = vfs.get(file);
          if (!entry || entry.type !== 'file') {
            term.write(`\r\n\x1b[31mTarget not found: ${parts[2]}\x1b[0m`);
            break;
          }
          term.write(`\r\n\x1b[90m$ bazel build ${parts[2]}\x1b[0m`);
          // Syntax check via compile()
          runningRef.current = true;
          syncAndRun(() => runPythonCode(
            `import py_compile, io, sys\ntry:\n    compile(open('${file}').read(), '${file}', 'exec')\n    print('\\x1b[32mBUILD SUCCESSFUL\\x1b[0m: ${parts[2]}')\nexcept SyntaxError as e:\n    print(f'\\x1b[31mBUILD FAILED\\x1b[0m: {e}')`
          ));
          return;
        } else if (sub === 'run' && parts[2]) {
          const target = parts[2].replace('//', '').replace(':', '/');
          const file = target.endsWith('.py') ? target : target + '.py';
          const entry = vfs.get(file);
          if (!entry || entry.type !== 'file') {
            term.write(`\r\n\x1b[31mTarget not found: ${parts[2]}\x1b[0m`);
            break;
          }
          term.write(`\r\n\x1b[90m$ bazel run ${parts[2]}\x1b[0m`);
          runningRef.current = true;
          syncAndRun(() => runPythonFile(file));
          return;
        } else if (sub === 'test' && parts[2]) {
          const target = parts[2].replace('//', '').replace(':', '/');
          const file = target.endsWith('.py') ? target : target + '.py';
          const entry = vfs.get(file);
          if (!entry || entry.type !== 'file') {
            term.write(`\r\n\x1b[31mTarget not found: ${parts[2]}\x1b[0m`);
            break;
          }
          term.write(`\r\n\x1b[90m$ bazel test ${parts[2]}\x1b[0m`);
          runningRef.current = true;
          syncAndRun(() => runPythonFile(file));
          return;
        } else if (sub === 'clean') {
          term.write('\r\n\x1b[90m$ bazel clean\x1b[0m');
          term.write('\r\n\x1b[32mBuild state cleared\x1b[0m');
          break;
        } else {
          term.write(`\r\n\x1b[90m$ ${cmd}\x1b[0m`);
          term.write('\r\n\x1b[33mUsage: bazel build | query | run | test <target> | clean\x1b[0m');
          break;
        }
      }
      case 'exec': {
        const code = parts.slice(1).join(' ');
        if (!code) {
          term.write('\r\n\x1b[33mUsage: exec <python code>\x1b[0m');
          break;
        }
        if (!state.pyodideReady) {
          term.write('\r\n\x1b[33m⚠ Python is still loading...\x1b[0m');
          break;
        }
        term.write(`\r\n\x1b[90m>>> ${code}\x1b[0m`);
        runningRef.current = true;
        runPythonCode(code);
        return;
      }
      case 'flask': {
        const flaskArgs = parts.slice(1);
        if (flaskArgs[0] === 'run' && flaskArgs[1]) {
          const filename = flaskArgs[1];
          if (!state.pyodideReady) {
            term.write('\r\n\x1b[33m⚠ Python is still loading...\x1b[0m');
            break;
          }
          term.write(`\r\n\x1b[36mStarting Flask server with ${filename}...\x1b[0m`);
          runningRef.current = true;
          syncFilesToWorker(vfs.getAllFiles());
          startServer(filename);
          return;
        }
        term.write('\r\n\x1b[33mUsage: flask run <file.py>\x1b[0m');
        break;
      }
      case 'server': {
        if (parts[1] === 'stop') {
          stopServer();
          setServerActive(false);
          term.write('\r\n\x1b[36mStopping server...\x1b[0m');
          break;
        }
        term.write('\r\n\x1b[33mUsage: server stop\x1b[0m');
        break;
      }
      case 'head': {
        const file = parts[1];
        const n = parts[2] ? parseInt(parts[2]) : 10;
        if (!file) { term.write('\r\n\x1b[33mUsage: head <file> [lines]\x1b[0m'); break; }
        const entry = vfs.get(file);
        if (!entry || entry.type !== 'file') { term.write(`\r\n\x1b[31mFile not found: ${file}\x1b[0m`); break; }
        const lines = (entry.content ?? '').split('\n').slice(0, n);
        for (const line of lines) term.write(`\r\n${line}`);
        break;
      }
      case 'tail': {
        const file = parts[1];
        const n = parts[2] ? parseInt(parts[2]) : 10;
        if (!file) { term.write('\r\n\x1b[33mUsage: tail <file> [lines]\x1b[0m'); break; }
        const entry = vfs.get(file);
        if (!entry || entry.type !== 'file') { term.write(`\r\n\x1b[31mFile not found: ${file}\x1b[0m`); break; }
        const lines = (entry.content ?? '').split('\n');
        const lastLines = lines.slice(Math.max(0, lines.length - n));
        for (const line of lastLines) term.write(`\r\n${line}`);
        break;
      }
      case 'wc': {
        const file = parts[1];
        if (!file) { term.write('\r\n\x1b[33mUsage: wc <file>\x1b[0m'); break; }
        const entry = vfs.get(file);
        if (!entry || entry.type !== 'file') { term.write(`\r\n\x1b[31mFile not found: ${file}\x1b[0m`); break; }
        const content = entry.content ?? '';
        const lineCount = content.split('\n').length;
        const wordCount = content.split(/\s+/).filter(w => w).length;
        const charCount = content.length;
        term.write(`\r\n  \x1b[36m${String(lineCount).padStart(6)}\x1b[0m lines  \x1b[36m${String(wordCount).padStart(6)}\x1b[0m words  \x1b[36m${String(charCount).padStart(6)}\x1b[0m chars  ${file}`);
        break;
      }
      case 'grep': {
        const pattern = parts[1];
        const targetFile = parts[2];
        if (!pattern) { term.write('\r\n\x1b[33mUsage: grep <pattern> [file]\x1b[0m'); break; }
        const allFiles = vfs.getAllFiles();
        const filesToSearch = targetFile ? { [targetFile]: allFiles[targetFile] } : allFiles;
        let found = 0;
        for (const [fpath, content] of Object.entries(filesToSearch)) {
          if (!content) continue;
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(pattern)) {
              const highlighted = lines[i].replace(
                new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                `\x1b[1;31m${pattern}\x1b[0m`
              );
              term.write(`\r\n\x1b[35m${fpath}\x1b[0m:\x1b[90m${i + 1}\x1b[0m: ${highlighted}`);
              found++;
            }
          }
        }
        if (found === 0) term.write(`\r\n\x1b[90mNo matches found for "${pattern}"\x1b[0m`);
        break;
      }
      case 'history': {
        const hist = historyRef.current;
        if (hist.length === 0) {
          term.write('\r\n\x1b[90mNo history\x1b[0m');
        } else {
          for (let i = 0; i < hist.length; i++) {
            term.write(`\r\n  \x1b[90m${String(i + 1).padStart(4)}\x1b[0m  ${hist[i]}`);
          }
        }
        break;
      }
      case 'date':
        term.write(`\r\n${new Date().toString()}`);
        break;
      case 'whoami':
        term.write('\r\npycode');
        break;
      case 'which': {
        const cmdName = parts[1];
        if (!cmdName) { term.write('\r\n\x1b[33mUsage: which <command>\x1b[0m'); break; }
        const KNOWN = [
          'ls', 'cat', 'tree', 'touch', 'mkdir', 'rm', 'cp', 'mv', 'echo', 'pwd', 'clear',
          'head', 'tail', 'wc', 'grep', 'history', 'date', 'whoami', 'which',
          'python', 'python3', 'exec', 'pip', 'uv', 'flask', 'server',
          'git', 'bazel', 'help',
        ];
        if (KNOWN.includes(cmdName)) {
          term.write(`\r\n\x1b[32m${cmdName}\x1b[0m: built-in command`);
        } else {
          term.write(`\r\n\x1b[31m${cmdName} not found\x1b[0m`);
        }
        break;
      }
      case 'pwd':
        term.write('\r\n/');
        break;
      case 'mkdir': {
        const dir = parts[1];
        if (!dir) { term.write('\r\n\x1b[33mUsage: mkdir <dir>\x1b[0m'); break; }
        // Create a placeholder file so the directory appears in VFS
        const placeholder = dir.replace(/\/$/, '') + '/.keep';
        vfs.set(placeholder, '');
        dispatch({ type: 'VFS_CHANGED' });
        term.write(`\r\n\x1b[32mCreated directory: ${dir}\x1b[0m`);
        break;
      }
      case 'touch': {
        const file = parts[1];
        if (!file) { term.write('\r\n\x1b[33mUsage: touch <file>\x1b[0m'); break; }
        if (!vfs.get(file)) {
          vfs.set(file, '');
          dispatch({ type: 'VFS_CHANGED' });
        }
        break;
      }
      case 'rm': {
        const file = parts[1];
        if (!file) { term.write('\r\n\x1b[33mUsage: rm <file>\x1b[0m'); break; }
        const entry = vfs.get(file);
        if (!entry) {
          term.write(`\r\n\x1b[31mNot found: ${file}\x1b[0m`);
        } else {
          vfs.delete(file);
          dispatch({ type: 'VFS_CHANGED' });
          dispatch({ type: 'CLOSE_TAB', path: file });
          term.write(`\r\n\x1b[32mRemoved: ${file}\x1b[0m`);
        }
        break;
      }
      case 'mv': {
        const src = parts[1], dst = parts[2];
        if (!src || !dst) { term.write('\r\n\x1b[33mUsage: mv <src> <dst>\x1b[0m'); break; }
        const entry = vfs.get(src);
        if (!entry || entry.type !== 'file') {
          term.write(`\r\n\x1b[31mNot found: ${src}\x1b[0m`);
        } else {
          vfs.set(dst, entry.content ?? '');
          vfs.delete(src);
          dispatch({ type: 'VFS_CHANGED' });
          dispatch({ type: 'CLOSE_TAB', path: src });
          dispatch({ type: 'OPEN_FILE', path: dst });
          term.write(`\r\n\x1b[32m${src} → ${dst}\x1b[0m`);
        }
        break;
      }
      case 'cp': {
        const src = parts[1], dst = parts[2];
        if (!src || !dst) { term.write('\r\n\x1b[33mUsage: cp <src> <dst>\x1b[0m'); break; }
        const entry = vfs.get(src);
        if (!entry || entry.type !== 'file') {
          term.write(`\r\n\x1b[31mNot found: ${src}\x1b[0m`);
        } else {
          vfs.set(dst, entry.content ?? '');
          dispatch({ type: 'VFS_CHANGED' });
          term.write(`\r\n\x1b[32mCopied ${src} → ${dst}\x1b[0m`);
        }
        break;
      }
      case 'echo': {
        const rest = cmd.trim().slice(5);
        const redirectMatch = rest.match(/^(.*?)\s*>\s*(\S+)$/);
        if (redirectMatch) {
          const text = redirectMatch[1].replace(/^["']|["']$/g, '');
          const file = redirectMatch[2];
          vfs.set(file, text + '\n');
          dispatch({ type: 'VFS_CHANGED' });
        } else {
          term.write(`\r\n${rest.replace(/^["']|["']$/g, '')}`);
        }
        break;
      }
      case 'tree': {
        const allFiles = Object.keys(vfs.getAllFiles()).sort();
        const printTree = (files: string[]) => {
          // Build a nested structure
          const root: Record<string, unknown> = {};
          for (const file of files) {
            const parts = file.split('/');
            let current = root;
            for (const part of parts) {
              if (!current[part]) current[part] = {};
              current = current[part] as Record<string, unknown>;
            }
          }
          // Recursively print
          const render = (node: Record<string, unknown>, prefix: string) => {
            const keys = Object.keys(node).sort((a, b) => {
              const aIsDir = Object.keys(node[a] as object).length > 0;
              const bIsDir = Object.keys(node[b] as object).length > 0;
              if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
              return a.localeCompare(b);
            });
            keys.forEach((key, idx) => {
              const isLast = idx === keys.length - 1;
              const connector = isLast ? '└── ' : '├── ';
              const childNode = node[key] as Record<string, unknown>;
              const isDir = Object.keys(childNode).length > 0;
              const colored = isDir ? `\x1b[1;34m${key}\x1b[0m` : (
                key.endsWith('.py') ? `\x1b[32m${key}\x1b[0m` :
                key.endsWith('.ipynb') ? `\x1b[35m${key}\x1b[0m` :
                key.endsWith('.toml') || key.endsWith('.json') ? `\x1b[33m${key}\x1b[0m` : key
              );
              term.write(`\r\n${prefix}${connector}${colored}`);
              if (isDir) {
                render(childNode, prefix + (isLast ? '    ' : '│   '));
              }
            });
          };
          term.write('\r\n\x1b[1;34m.\x1b[0m');
          render(root, '');
          term.write(`\r\n\r\n\x1b[90m${files.length} files\x1b[0m`);
        };
        printTree(allFiles);
        break;
      }
      case 'help':
        term.write('\r\n');
        term.write('\r\n\x1b[1;36m  Filesystem\x1b[0m');
        term.write('\r\n    ls [-l] [dir]        List files (colored)');
        term.write('\r\n    cat [-n] <file>      Display file contents');
        term.write('\r\n    head <file> [n]      First n lines (default 10)');
        term.write('\r\n    tail <file> [n]      Last n lines (default 10)');
        term.write('\r\n    wc <file>            Line, word, char count');
        term.write('\r\n    grep <pat> [file]    Search in files');
        term.write('\r\n    tree                 Show file tree');
        term.write('\r\n    touch <file>         Create empty file');
        term.write('\r\n    mkdir <dir>          Create directory');
        term.write('\r\n    rm <file>            Remove a file');
        term.write('\r\n    cp <src> <dst>       Copy a file');
        term.write('\r\n    mv <src> <dst>       Move/rename a file');
        term.write('\r\n    echo <text> [> f]    Print or redirect');
        term.write('\r\n    pwd                  Working directory');
        term.write('\r\n    clear                Clear terminal');
        term.write('\r\n');
        term.write('\r\n\x1b[1;36m  Python\x1b[0m');
        term.write('\r\n    python <file>        Run a Python file');
        term.write('\r\n    python -c "code"     Execute inline code');
        term.write('\r\n    exec <code>          Execute Python inline');
        term.write('\r\n    pip install <pkg>    Install a package');
        term.write('\r\n    pip list             List packages');
        term.write('\r\n');
        term.write('\r\n\x1b[1;36m  UV\x1b[0m');
        term.write('\r\n    uv init               Create pyproject.toml');
        term.write('\r\n    uv sync               Install dependencies');
        term.write('\r\n    uv run <file>          Run via uv');
        term.write('\r\n    uv add/remove <pkg>   Manage dependencies');
        term.write('\r\n');
        term.write('\r\n\x1b[1;36m  Web Server\x1b[0m');
        term.write('\r\n    flask run <file>       Start Flask/FastAPI');
        term.write('\r\n    server stop            Stop the server');
        term.write('\r\n');
        term.write('\r\n\x1b[1;36m  Git\x1b[0m');
        term.write('\r\n    git clone/status/add/commit/push/pull/log');
        term.write('\r\n    git branch/checkout/diff/reset');
        term.write('\r\n');
        term.write('\r\n\x1b[1;36m  Bazel\x1b[0m');
        term.write('\r\n    bazel query/build/run/test/clean');
        term.write('\r\n');
        term.write('\r\n\x1b[1;36m  Utilities\x1b[0m');
        term.write('\r\n    history              Command history');
        term.write('\r\n    which <cmd>          Check if command exists');
        term.write('\r\n    date                 Current date/time');
        term.write('\r\n    whoami               Current user');
        term.write('\r\n');
        term.write('\r\n  \x1b[90m↑↓ History  Tab Complete  Ctrl+C Cancel  Ctrl+U Clear\x1b[0m');
        break;
      default:
        term.write(`\r\n\x1b[31mCommand not found: ${command}\x1b[0m`);
        term.write('\r\n\x1b[90mType "help" for available commands\x1b[0m');
    }

    writePrompt();
  }, [vfs, state.pyodideReady, state.installedPackages, writePrompt, syncAndRun, dispatch, handleGitCommand]);

  // Keep the ref in sync
  useEffect(() => {
    handleCommandRef.current = handleCommand;
  }, [handleCommand]);

  // Listen to worker output messages
  useEffect(() => {
    const removeListener = addWorkerListener((msgType: string, data: unknown, fullMsg?: Record<string, unknown>) => {
      const term = termRef.current;
      if (!term) return;

      switch (msgType) {
        case 'stdout': {
          const text = (data as string).replace(/\n/g, '\r\n');
          term.write(`\r\n${text}`);
          break;
        }
        case 'stderr': {
          const errText = (data as string).replace(/\n/g, '\r\n');
          term.write(`\r\n\x1b[31m${errText}\x1b[0m`);
          break;
        }
        case 'image':
          // Plot image received from matplotlib
          if (typeof data === 'string') {
            setPlotImages(prev => [...prev, data]);
          }
          break;
        case 'server-started':
          setServerActive(true);
          setActivePanel('preview');
          // Refresh the preview iframe
          setTimeout(() => {
            if (previewRef.current) {
              previewRef.current.src = previewUrl;
            }
          }, 100);
          break;
        case 'server-stopped':
          setServerActive(false);
          setActivePanel('terminal');
          break;
        case 'done':
          runningRef.current = false;
          writePrompt();
          break;
        case 'repl-done':
          runningRef.current = false;
          writePrompt();
          break;
        case 'input-request': {
          // Python called input() — show prompt and switch to input mode
          const buffer = (fullMsg as Record<string, unknown>)?.buffer as SharedArrayBuffer;
          if (buffer) {
            const prompt = data as string;
            if (prompt) {
              term.write(`\r\n${prompt}`);
            }
            inputBufferRef.current = buffer;
          }
          break;
        }
      }

      if (msgType === 'stdout' && typeof data === 'string' && data.startsWith('Successfully installed ')) {
        const pkg = data.replace('Successfully installed ', '').trim();
        dispatch({ type: 'ADD_PACKAGE', pkg });
        runningRef.current = false;
        writePrompt();
      }

      if (msgType === 'stderr' && typeof data === 'string' && data.startsWith('Failed to install ')) {
        runningRef.current = false;
        writePrompt();
      }
    });

    return removeListener;
  }, [addWorkerListener, writePrompt, dispatch]);

  // Initialize terminal only once
  useEffect(() => {
    if (!termContainerRef.current || termRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
      },
      fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termContainerRef.current);
    fit.fit();

    term.writeln('');
    term.writeln('  \x1b[1;36m┌───────────────────────────────────┐\x1b[0m');
    term.writeln('  \x1b[1;36m│\x1b[0m  \x1b[1;37m⚡ PyCode Terminal\x1b[0m                \x1b[1;36m│\x1b[0m');
    term.writeln('  \x1b[1;36m│\x1b[0m  \x1b[90mPython in the browser\x1b[0m            \x1b[1;36m│\x1b[0m');
    term.writeln('  \x1b[1;36m└───────────────────────────────────┘\x1b[0m');
    term.writeln('');
    term.writeln('  \x1b[90mType \x1b[36mhelp\x1b[90m for commands · \x1b[36m↑↓\x1b[90m history · \x1b[36mTab\x1b[90m complete\x1b[0m');
    term.write('\r\n\x1b[36m❯\x1b[0m ');

    term.onData((data) => {
      // Block input while a command is running (unless waiting for input())
      if (runningRef.current && !inputBufferRef.current) return;

      // Helper to clear and rewrite the current line
      const rewriteLine = (newCmd: string) => {
        // Clear current input from display
        const oldLen = cmdBufRef.current.length;
        term.write('\b'.repeat(oldLen) + ' '.repeat(oldLen) + '\b'.repeat(oldLen));
        cmdBufRef.current = newCmd;
        term.write(newCmd);
      };

      // Enter — execute command or submit input
      if (data === '\r') {
        const cmd = cmdBufRef.current;
        cmdBufRef.current = '';

        // If we're in input mode, send the text back to the worker
        const inputBuf = inputBufferRef.current;
        if (inputBuf) {
          inputBufferRef.current = null;
          const int32 = new Int32Array(inputBuf);
          const uint8 = new Uint8Array(inputBuf);
          const encoded = new TextEncoder().encode(cmd);
          int32[1] = encoded.length; // Store length at offset 4
          uint8.set(encoded, 8);     // Store text bytes at offset 8
          Atomics.store(int32, 0, 1); // Set flag
          Atomics.notify(int32, 0);   // Wake worker
          term.write('\r\n');
          runningRef.current = true;  // Block terminal while Python runs
          return;
        }

        // Normal command mode — add to history
        if (cmd.trim() && historyRef.current[historyRef.current.length - 1] !== cmd.trim()) {
          historyRef.current.push(cmd.trim());
        }
        historyIdxRef.current = -1;
        handleCommandRef.current(cmd);
        return;
      }

      // Backspace
      if (data === '\x7f') {
        if (cmdBufRef.current.length > 0) {
          cmdBufRef.current = cmdBufRef.current.slice(0, -1);
          term.write('\b \b');
        }
        return;
      }

      // Ctrl+C — cancel
      if (data === '\x03') {
        // If in input mode, send empty input to unblock the worker
        if (inputBufferRef.current) {
          const inputBuf = inputBufferRef.current;
          inputBufferRef.current = null;
          const int32 = new Int32Array(inputBuf);
          int32[1] = 0;
          Atomics.store(int32, 0, 1);
          Atomics.notify(int32, 0);
        }
        cmdBufRef.current = '';
        historyIdxRef.current = -1;
        runningRef.current = false;
        term.write('^C');
        term.write('\r\n\x1b[36m❯\x1b[0m ');
        return;
      }

      // Ctrl+U — clear line
      if (data === '\x15') {
        rewriteLine('');
        return;
      }

      // Arrow keys (escape sequences)
      if (data === '\x1b[A') {
        // Up arrow — previous history
        const history = historyRef.current;
        if (history.length === 0) return;
        if (historyIdxRef.current === -1) {
          savedCmdRef.current = cmdBufRef.current;
          historyIdxRef.current = history.length - 1;
        } else if (historyIdxRef.current > 0) {
          historyIdxRef.current--;
        }
        rewriteLine(history[historyIdxRef.current]);
        return;
      }

      if (data === '\x1b[B') {
        // Down arrow — next history
        const history = historyRef.current;
        if (historyIdxRef.current === -1) return;
        if (historyIdxRef.current < history.length - 1) {
          historyIdxRef.current++;
          rewriteLine(history[historyIdxRef.current]);
        } else {
          historyIdxRef.current = -1;
          rewriteLine(savedCmdRef.current);
        }
        return;
      }

      // Tab — auto-complete
      if (data === '\t') {
        const input = cmdBufRef.current;
        const parts = input.split(/\s+/);

        const COMMANDS = [
          'ls', 'cat', 'tree', 'touch', 'mkdir', 'rm', 'cp', 'mv', 'echo', 'pwd', 'clear',
          'head', 'tail', 'wc', 'grep', 'history', 'date', 'whoami', 'which',
          'python', 'python3', 'exec', 'pip', 'uv', 'flask', 'server',
          'git', 'bazel', 'help',
        ];

        if (parts.length <= 1) {
          // Complete command name
          const prefix = parts[0] || '';
          const matches = COMMANDS.filter(c => c.startsWith(prefix));
          if (matches.length === 1) {
            rewriteLine(matches[0] + ' ');
          } else if (matches.length > 1) {
            term.write(`\r\n\x1b[90m${matches.join('  ')}\x1b[0m`);
            term.write('\r\n\x1b[36m❯\x1b[0m ' + input);
          }
        } else {
          // Complete filename
          const partial = parts[parts.length - 1];
          const allFiles = Object.keys(vfs.getAllFiles());
          const matches = allFiles.filter(f => f.startsWith(partial));
          if (matches.length === 1) {
            parts[parts.length - 1] = matches[0];
            rewriteLine(parts.join(' '));
          } else if (matches.length > 1) {
            // Find common prefix
            let common = matches[0];
            for (const m of matches) {
              while (!m.startsWith(common)) {
                common = common.slice(0, -1);
              }
            }
            if (common.length > partial.length) {
              parts[parts.length - 1] = common;
              rewriteLine(parts.join(' '));
            } else {
              term.write(`\r\n\x1b[90m${matches.join('  ')}\x1b[0m`);
              term.write('\r\n\x1b[36m❯\x1b[0m ' + input);
            }
          }
        }
        return;
      }

      // Regular printable characters
      if (data >= ' ') {
        cmdBufRef.current += data;
        term.write(data);
      }
    });

    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!collapsed && fitRef.current) {
      setTimeout(() => fitRef.current?.fit(), 50);
    }
  }, [collapsed]);

  const handleClear = useCallback(() => {
    termRef.current?.clear();
    setPlotImages([]);
  }, []);

  return (
    <div id="panel" className={collapsed ? 'collapsed' : ''}>
      <div id="panel-header">
        <div className="panel-tabs">
          <div
            className={`panel-tab${activePanel === 'terminal' ? ' active' : ''}`}
            onClick={() => setActivePanel('terminal')}
          >
            <span className="codicon codicon-terminal" />
            Terminal
          </div>
          {serverActive && (
            <div
              className={`panel-tab${activePanel === 'preview' ? ' active' : ''}`}
              onClick={() => setActivePanel('preview')}
            >
              <span className="codicon codicon-globe" />
              Preview
            </div>
          )}
        </div>
        <div className="panel-actions" style={{ display: 'flex', gap: 2 }}>
          {activePanel === 'preview' && (
            <>
              <button
                className="icon-btn"
                title="Open in New Tab"
                onClick={() => window.open(previewUrl, '_blank')}
              >
                <span className="codicon codicon-link-external" />
              </button>
              <button
                className="icon-btn"
                title="Refresh Preview"
                onClick={() => {
                  if (previewRef.current) previewRef.current.src = previewUrl;
                }}
              >
                <span className="codicon codicon-refresh" />
              </button>
              <button
                className="icon-btn"
                title="Stop Server"
                style={{ color: '#f44336' }}
                onClick={() => {
                  stopServer();
                  setServerActive(false);
                  setActivePanel('terminal');
                  const term = termRef.current;
                  if (term) {
                    term.write('\r\n\x1b[36m⏹️ Server stopped.\x1b[0m');
                    writePrompt();
                  }
                }}
              >
                <span className="codicon codicon-debug-stop" />
              </button>
            </>
          )}
          <button className="icon-btn" title="Clear" onClick={handleClear}>
            <span className="codicon codicon-clear-all" />
          </button>
          <button className="icon-btn" title="Toggle" onClick={onToggle}>
            <span className="codicon codicon-chevron-down" />
          </button>
        </div>
      </div>

      {/* Terminal view */}
      <div style={{ display: activePanel === 'terminal' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Plot images panel */}
        {plotImages.length > 0 && (
          <div className="terminal-plots">
            <div className="terminal-plots-header">
              <span className="terminal-plots-title">
                <span className="codicon codicon-graph" /> Plots ({plotImages.length})
              </span>
              <button
                className="icon-btn"
                title="Clear All Plots"
                onClick={() => setPlotImages([])}
              >
                <span className="codicon codicon-close-all" />
              </button>
            </div>
            <div className="terminal-plots-scroll">
              {plotImages.map((src, i) => (
                <div key={i} className="terminal-plot-item">
                  <img src={src} alt={`Plot ${i + 1}`} className="terminal-plot-img" />
                  <button
                    className="terminal-plot-close"
                    title="Remove"
                    onClick={() => setPlotImages(prev => prev.filter((_, j) => j !== i))}>
                    <span className="codicon codicon-close" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div
          id="terminal-container"
          ref={termContainerRef}
          style={{ flex: 1, overflow: 'hidden' }}
        />
      </div>

      {/* Preview view */}
      {activePanel === 'preview' && (
        <div className="preview-panel">
          <div className="preview-url-bar">
            <span className="codicon codicon-globe" />
            <input
              type="text"
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && previewRef.current) {
                  previewRef.current.src = previewUrl;
                }
              }}
              className="preview-url-input"
            />
            <button
              className="icon-btn"
              title="Go"
              onClick={() => {
                if (previewRef.current) previewRef.current.src = previewUrl;
              }}
            >
              <span className="codicon codicon-arrow-right" />
            </button>
          </div>
          <iframe
            ref={previewRef}
            src={previewUrl}
            className="preview-iframe"
            title="Web Server Preview"
            sandbox="allow-same-origin allow-scripts"
          />
        </div>
      )}
    </div>
  );
}
