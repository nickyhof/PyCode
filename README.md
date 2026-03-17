# PyCode

A browser-only Python IDE with AI. No backend, no installation — just open it in a browser.

**[Try it live → trypycode.com](https://trypycode.com)**

![PyCode IDE](screenshot_1.png)

![PyCode IDE](screenshot_2.png)

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

To build for production:

```bash
npm run build
npx serve dist
```

To open a GitHub repo directly:

```
http://localhost:5173?repo=https://github.com/user/repo
```

## Features

- **Monaco Editor** — Full VS Code editing experience with syntax highlighting, IntelliSense, and multi-tab support
- **Jupyter Notebooks** — Native `.ipynb` editor with per-cell execution, markdown rendering, and cell management (add, delete, move, toggle type)
- **Python Execution** — Run Python files and notebook cells via Pyodide (WebAssembly) — no server required
- **Live Plotting** — `matplotlib` charts render inline in the terminal and notebook cells
- **Web Server** — Run Flask and FastAPI apps entirely in the browser via a Service Worker WSGI/ASGI bridge with a built-in preview panel
- **Local Filesystem** — Open folders from your disk via the File System Access API — edit and save files directly
- **In-Browser Git** — Clone, commit, push, pull, stage, diff — all powered by `isomorphic-git`
- **Shareable URLs** — Share code via compressed URL hash fragments — no backend needed
- **Command Palette** — VS Code-style quick launcher for files and commands
- **Built-in Terminal** — xterm.js terminal with `python`, `git`, `uv`, `flask`, and `bazel` commands
- **AI Copilot** — Chat and inline agent mode via GitHub Models API
- **Workspaces** — Isolated environments persisted in IndexedDB
- **Package Management** — Install PyPI packages via Pyodide's micropip with `uv sync` support

## Web Server (Flask / FastAPI)

Run Python web apps entirely in the browser — no real server needed.

**How it works:** A Service Worker intercepts HTTP requests under `/pycode-server/`, routes them through the main thread to a WSGI (Flask) or ASGI (FastAPI) adapter running in the Pyodide worker, and returns real HTTP responses.

```bash
# Terminal
flask run examples/flask_app.py

# Or just press F5 on any Flask/FastAPI file — auto-detected!
```

- Preview panel opens automatically alongside the terminal
- Navigate routes via the built-in URL bar
- Open in a new tab for full-page view
- Stop with the ⏹ button or `server stop` command

## Workspaces

Each workspace is an isolated environment with its own files and Git history.

- Click the **workspace name** in the titlebar to open the picker
- **+ New Workspace** — creates a fresh, empty workspace
- **🗑 Delete** — hover over a workspace to remove it (can't delete default or active)
- Workspaces persist in IndexedDB across browser sessions

## Terminal Commands

```
python main.py          Run a Python file
clear                   Clear the terminal
ls                      List files
cat <file>              Display file contents
help                    Show available commands

flask run <file.py>     Start a Flask/FastAPI web server
server stop             Stop the web server

uv sync                 Install workspace dependencies
uv run main.py          Run a file via uv
bazel query //...       List build targets
bazel run //app:app     Run a py_binary

git status              Show changed files
git clone <url>         Clone a repository
git add / commit / log  Stage, commit, view history
git push / pull         Push commits / pull updates
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Command palette (file search) |
| `Ctrl+Shift+P` | Command palette (commands) |
| `Ctrl+N` | New file |
| `Ctrl+J` | New notebook |
| `Ctrl+S` | Save file |
| `Ctrl+W` | Close tab |
| `Ctrl+B` | Toggle sidebar |
| `` Ctrl+` `` | Toggle terminal |
| `F5` | Run active Python file (auto-detects Flask/FastAPI) |
| `Ctrl+Shift+E` | Explorer panel |
| `Ctrl+Shift+F` | Search panel |
| `Ctrl+Shift+G` | Git panel |

## Sample Project

The Quick Start project includes runnable examples:

| File | Description |
|------|-------------|
| `main.py` | Hello world |
| `examples/plotting.py` | Matplotlib charts (line, bar, scatter) |
| `examples/pandas_demo.py` | DataFrames, groupby, pivot tables |
| `examples/pandas_notebook.ipynb` | Interactive pandas + plotting notebook |
| `examples/flask_app.py` | Flask web app with HTML routes + JSON API |
| `examples/fastapi_app.py` | FastAPI web app with async routes + JSON API |
| `notebook.ipynb` | General notebook with plotting |

## Copilot

Built-in AI chat panel and inline completions via GitHub Models API.

1. Go to **Settings → GitHub Token** and enter a GitHub PAT (with Models permission)
2. Click the ✨ icon to open the chat
3. **Ask** mode — get answers about your code
4. **Agent** mode — AI proposes targeted file edits you can accept or reject

Models: GPT-4o · GPT-4o Mini · o3-mini

## Architecture

```
src/
├── App.tsx                    # Root component + layout
├── context/AppContext.tsx      # Global state (useReducer)
├── hooks/
│   ├── useResize.ts           # Drag-to-resize panels
│   └── useKeyboard.ts         # Global keyboard shortcuts
├── services/
│   ├── vfs.ts                 # Virtual File System
│   ├── git.ts                 # In-browser Git (isomorphic-git)
│   ├── copilot.ts             # GitHub Models API
│   ├── pyodide.ts             # Python execution (Web Worker)
│   ├── webServer.ts           # Service Worker HTTP bridge
│   ├── shareUrl.ts            # Shareable URL encoding
│   ├── toml.ts                # TOML parser
│   ├── uv.ts                  # UV workspace analysis
│   └── bazel.ts               # Bazel BUILD parser
├── components/
│   ├── TitleBar/               # App branding + workspace picker
│   ├── ActivityBar/            # Sidebar navigation icons
│   ├── Sidebar/                # Explorer, Search, Git, Settings
│   ├── Editor/                 # Monaco Editor, Notebook Editor, tabs
│   ├── Terminal/               # xterm.js terminal + preview panel
│   ├── CommandPalette/         # Ctrl+P / Ctrl+Shift+P launcher
│   ├── Copilot/                # AI chat panel
│   ├── StatusBar/              # Git branch, language, cursor
│   ├── Dialog/                 # Prompt and confirm modals
│   ├── Notification/           # Toast notifications
│   ├── ContextMenu/            # Right-click menus
│   └── shared/                 # Reusable UI primitives
public/
├── pyodide-worker.js           # Pyodide Web Worker (WSGI/ASGI adapter)
└── pycode-sw.js                # Service Worker (virtual HTTP server)
```

## Tech Stack

**React 19** · **TypeScript** · **Vite** ·
[Monaco Editor](https://github.com/microsoft/monaco-editor) ·
[Pyodide](https://github.com/pyodide/pyodide) ·
[xterm.js](https://github.com/xtermjs/xterm.js) ·
[isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) ·
[LightningFS](https://github.com/isomorphic-git/lightning-fs)

All dependencies bundled via npm. Zero backend required.

## Limitations

- **Browser sandbox** — No access to your local filesystem, native processes, or system Python. Everything runs inside the browser.
- **Pyodide, not CPython** — Python runs via WebAssembly (Pyodide). C extensions that aren't pre-compiled for Pyodide won't work (`numpy`, `pandas`, `scikit-learn` do work).
- **No real pip** — `pip install` uses Pyodide's micropip, which pulls from PyPI but only supports pure-Python wheels and Pyodide-built packages.
- **Simulated uv/bazel** — `uv` and `bazel` commands are simulated interpretations of config files, not the real tools.
- **Git clone/push limitations** — Git uses `isomorphic-git` in-browser, which requires the remote to support CORS. Public GitHub repos work. Push requires a PAT with `Contents: Read and write` permission.
- **No multi-file debugging** — No breakpoints, debugger, or step-through. Use `print()`.
- **Storage is IndexedDB** — Files persist in the browser's IndexedDB. Clearing site data erases everything.
- **Copilot requires a PAT** — The GitHub PAT is stored in `localStorage` (not encrypted). Use a fine-grained token with minimal permissions.
- **Web server is single-threaded** — Flask/FastAPI apps run in the same Pyodide worker, so requests are handled sequentially.
