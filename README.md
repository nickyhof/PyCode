# PyCode

A standalone, browser-only Python IDE powered by [Monaco Editor](https://microsoft.github.io/monaco-editor/), [Pyodide](https://pyodide.org/), and [xterm.js](https://xtermjs.org/). No backend, no installation — just open it in a browser.

![PyCode Screenshot](https://img.shields.io/badge/Python-In_Browser-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-orange?style=for-the-badge)

## Features

- **Monaco Editor** — VS Code's editor engine with Python syntax highlighting, autocomplete, bracket matching, and minimap
- **Pyodide (Python 3 via WebAssembly)** — Full CPython running in a Web Worker so the UI never freezes
- **xterm.js Terminal** — Run scripts, install packages, or type Python directly
- **Git (In-Browser)** — Stage, commit, diff, branch, checkout, and view history — all client-side via isomorphic-git
- **Virtual File System** — Create, rename, and delete files/folders in-browser
- **Multi-tab Editing** — Open multiple files with dirty-state tracking
- **Cross-file Imports** — `from utils import greet` works out of the box
- **Package Management** — Install PyPI packages via `pip install` (powered by micropip)
- **Search** — Full-text search across all open project files
- **Settings** — Configurable font size, tab size, word wrap, and minimap
- **VS Code Dark Theme** — Pixel-accurate dark theme with smooth animations

## Quick Start

```bash
# Serve the files (Web Workers require a server)
npx serve .

# Open http://localhost:3000
```

Or use any static file server — Python's built-in works too:

```bash
python3 -m http.server 3000
```

Then open [http://localhost:3000](http://localhost:3000) in Chrome, Edge, Firefox, or Safari.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `F5` | Run current file |
| `Cmd/Ctrl + S` | Save file |
| `Cmd/Ctrl + `` ` `` | Toggle terminal |
| `Cmd/Ctrl + B` | Toggle sidebar |
| `Cmd/Ctrl + W` | Close tab |
| `Cmd/Ctrl + Shift + P` | Command palette |

## Terminal Commands

```
python main.py       # Run a Python file
pip install numpy    # Install a PyPI package
ls                   # List files
cat utils.py         # Print file contents
git status           # Show changed files
git add .            # Stage all changes
git commit -m "msg"  # Commit staged changes
git log              # View commit history
git branch           # List / create branches
git checkout <name>  # Switch branches
git diff <file>      # View file diff
clear                # Clear terminal
help                 # Show available commands
```

You can also type Python expressions directly — they'll be evaluated inline.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                     Browser                       │
│                                                   │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐   │
│  │  Monaco   │  │  xterm.js │  │  Virtual FS  │   │
│  │  Editor   │  │  Terminal │  │  (in-memory) │   │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘   │
│       │              │               │            │
│       └──────────┬───┘───────────────┘            │
│                  │                                 │
│          ┌───────┴────────┐   ┌───────────────┐   │
│          │   app.js       │   │   git.js       │   │
│          │   (main thread)│──▶│  isomorphic-  │   │
│          └───────┬────────┘   │  git + LFS    │   │
│                  │            └───────┬───────┘   │
│                  │ postMessage        │ IndexedDB │
│          ┌───────┴────────┐   ┌──────┴────────┐   │
│          │  Web Worker    │   │  LightningFS  │   │
│          │  (Pyodide)     │   │  (.git store) │   │
│          └────────────────┘   └───────────────┘   │
└──────────────────────────────────────────────────┘
```

**Five files, zero build tools:**

| File | Purpose |
|---|---|
| `index.html` | App shell, CDN imports |
| `styles.css` | VS Code dark theme |
| `app.js` | Editor, file explorer, tabs, terminal, git UI |
| `git.js` | In-browser Git operations (isomorphic-git) |
| `pyodide-worker.js` | Python execution in a Web Worker |

## Tech Stack

| Library | Version | Purpose |
|---|---|---|
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | 0.52.2 | Code editor |
| [Pyodide](https://github.com/pyodide/pyodide) | 0.27.4 | Python → WASM |
| [xterm.js](https://github.com/xtermjs/xterm.js) | 5.5.0 | Terminal emulator |
| [isomorphic-git](https://github.com/nicolo-ribaudo/isomorphic-git) | 1.27.1 | Git in JS |
| [lightning-fs](https://github.com/nicolo-ribaudo/isomorphic-git-lightning-fs) | 4.6.0 | IndexedDB file system |
| [Codicons](https://github.com/microsoft/vscode-codicons) | 0.0.36 | VS Code icons |

All loaded from [jsDelivr CDN](https://www.jsdelivr.com/) — nothing to install.

