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
        const tree = vfs.tree();
        const children = Object.values(tree.children).sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        for (const child of children) {
          if (child.type === 'directory') {
            term.write(`\r\n\x1b[34m${child.name}/\x1b[0m`);
          } else {
            term.write(`\r\n${child.name}`);
          }
        }
        break;
      }
      case 'cat': {
        const path = parts[1];
        if (!path) { term.write('\r\n\x1b[33mUsage: cat <file>\x1b[0m'); break; }
        const entry = vfs.get(path);
        if (!entry || entry.type !== 'file') {
          term.write(`\r\n\x1b[31mFile not found: ${path}\x1b[0m`);
        } else {
          term.write(`\r\n${entry.content}`);
        }
        break;
      }
      case 'python':
      case 'python3': {
        const file = parts[1];
        if (!file) {
          term.write('\r\n\x1b[33mUsage: python <file.py>\x1b[0m');
          break;
        }
        if (!state.pyodideReady) {
          term.write('\r\n\x1b[33m⚠ Python is still loading...\x1b[0m');
          break;
        }
        const entry = vfs.get(file);
        if (!entry || entry.type !== 'file') {
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
      case 'help':
        term.write('\r\n\x1b[36mAvailable commands:\x1b[0m');
        term.write('\r\n  clear                Clear the terminal');
        term.write('\r\n  ls                   List files');
        term.write('\r\n  cat <file>           Display file contents');
        term.write('\r\n  python <file>        Run a Python file');
        term.write('\r\n  pip install <pkg>    Install a package');
        term.write('\r\n  pip list             List installed packages');
        term.write('\r\n  uv sync             Install from pyproject.toml');
        term.write('\r\n  uv init             Create pyproject.toml');
        term.write('\r\n  uv run <file>       Run a Python file');
        term.write('\r\n  uv add <pkg>        Add and install dependency');
        term.write('\r\n  uv remove <pkg>     Remove dependency');
        term.write('\r\n  uv pip install <p>  Install a package');
        term.write('\r\n  uv pip list         List installed packages');
        term.write('\r\n  flask run <file>     Start a Flask web server');
        term.write('\r\n  server stop          Stop the web server');
        term.write('\r\n  exec <code>          Execute Python code');
        term.write('\r\n  bazel query          List all targets');
        term.write('\r\n  bazel build <t>      Syntax-check a target');
        term.write('\r\n  bazel run <target>   Run a Bazel target');
        term.write('\r\n  bazel test <target>  Run a test target');
        term.write('\r\n  bazel clean          Clear build state');
        term.write('\r\n');
        term.write('\r\n\x1b[36mGit commands:\x1b[0m');
        term.write('\r\n  git init             Initialize a repository');
        term.write('\r\n  git clone <url>      Clone a repository');
        term.write('\r\n  git status           Show working tree status');
        term.write('\r\n  git add <file|.>     Stage changes');
        term.write('\r\n  git commit -m "msg"  Commit staged changes');
        term.write('\r\n  git log              Show commit history');
        term.write('\r\n  git branch [name]    List or create branches');
        term.write('\r\n  git checkout <br>    Switch branches');
        term.write('\r\n  git diff <file>      Show file diff');
        term.write('\r\n  git push             Push to remote');
        term.write('\r\n  git pull             Pull from remote');
        term.write('\r\n  git reset <f|--hard> Reset file or all changes');
        term.write('\r\n  help                 Show this help');
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
    const removeListener = addWorkerListener((msgType: string, data: unknown) => {
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

    term.writeln('\x1b[36m╔═══════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[36m║          PyCode Terminal              ║\x1b[0m');
    term.writeln('\x1b[36m╚═══════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[90mType "help" for available commands\x1b[0m');
    term.write('\r\n\x1b[36m❯\x1b[0m ');

    term.onData((data) => {
      if (runningRef.current) return;
      if (data === '\r') {
        const cmd = cmdBufRef.current;
        cmdBufRef.current = '';
        handleCommandRef.current(cmd);
      } else if (data === '\x7f') {
        if (cmdBufRef.current.length > 0) {
          cmdBufRef.current = cmdBufRef.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (data === '\x03') {
        cmdBufRef.current = '';
        term.write('^C');
        term.write('\r\n\x1b[36m❯\x1b[0m ');
      } else if (data >= ' ') {
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
