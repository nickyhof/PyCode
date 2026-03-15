# PyCode

A browser-only Python IDE. No backend, no installation — just open it in a browser.

## Quick Start

```bash
npx serve .
# or
python3 -m http.server 3000
```

Open [http://localhost:3000](http://localhost:3000).

## Terminal Commands

```
python main.py          Run a Python file
pip install numpy       Install a PyPI package

uv sync                 Install workspace dependencies
uv run main.py          Run a file via uv
bazel query //...       List build targets
bazel run //app:app     Run a py_binary
bazel test //pkg:tgt    Run a py_test

git status              Show changed files
git clone <url>         Clone a repository
git add / commit / log  Stage, commit, view history
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `F5` | Run current file |
| `Cmd/Ctrl + S` | Save file |
| `Cmd/Ctrl + `` ` `` | Toggle terminal |
| `Cmd/Ctrl + Shift + P` | Command palette |

## Architecture

Five files, zero build tools:

| File | Purpose |
|---|---|
| `index.html` | App shell, CDN imports |
| `styles.css` | VS Code dark theme |
| `app.js` | Editor, terminal, file explorer, uv/bazel simulation |
| `git.js` | In-browser Git (isomorphic-git) |
| `pyodide-worker.js` | Python execution in a Web Worker |

## Tech Stack

[Monaco Editor](https://github.com/microsoft/monaco-editor) ·
[Pyodide](https://github.com/pyodide/pyodide) ·
[xterm.js](https://github.com/xtermjs/xterm.js) ·
[isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) ·
[LightningFS](https://github.com/nicolo-ribaudo/isomorphic-git-lightning-fs)

All loaded from CDN — nothing to install.
