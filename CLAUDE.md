# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PyCode is a browser-only Python IDE built with React + TypeScript. It runs entirely in the browser using Pyodide (Python via WebAssembly) with no backend infrastructure. Live at [trypycode.com](https://trypycode.com).

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Start dev server (http://localhost:5173)
npm run build     # Production build (TypeScript check + Vite bundle)
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

There are no tests in this project.

## Architecture

The app has three execution contexts that communicate via `postMessage` and `BroadcastChannel`:

1. **Main thread** — React UI (Monaco Editor, file tree, terminal, git panel, AI chat)
2. **Pyodide Worker** (`public/pyodide-worker.js`) — Runs Python code in WebAssembly; handles package installs, matplotlib rendering, and WSGI/ASGI execution
3. **Service Worker** (`public/pycode-sw.js`) — Acts as a virtual HTTP server; intercepts `/pycode-server/*` requests and routes them to the Pyodide worker for Flask/FastAPI apps

### Key Services (`src/services/`)

- **`vfs.ts`** — In-memory virtual filesystem (Map-based); initialized from `/public/default-project/manifest.json` on first load
- **`pyodide.ts`** — Bridge to the Pyodide worker; exposes `runPythonFile`, `runCell`, `installPackage`
- **`webServer.ts`** — Service Worker bridge for serving Flask/FastAPI responses
- **`git.ts`** — In-browser Git via `isomorphic-git` + `LightningFS` (IndexedDB-backed)
- **`copilot.ts`** — GitHub Models API integration for the AI chat panel

### Global State (`src/context/AppContext.tsx`)

Single `useReducer`-based context managing: open tabs, file tree, settings (persisted to `localStorage`), git status, workspace, sidebar/panel visibility, and worker listeners. All components read/dispatch from this context.

### Component Layout

`App.tsx` sets up a drag-to-resize three-column layout:
- **ActivityBar** (icon nav) → drives which **Sidebar** panel is shown (Explorer, Search, Git, Settings, Packages)
- **EditorArea** — Monaco Editor tabs + Jupyter notebook editor + CodeLens run buttons
- **TerminalPanel** — xterm.js terminal + web preview iframe

### Storage

| What | Where |
|------|-------|
| VFS files | In-memory (lost on reload unless local folder is open) |
| Settings, git credentials | `localStorage` |
| Git history, workspaces | IndexedDB (via LightningFS / isomorphic-git) |
| Local folder access | File System Access API (ephemeral handle) |

## Important Constraints

- **Pyodide ≠ CPython** — C extensions must be pre-compiled for WASM. Not all pip packages work.
- **COEP/COOP headers required** — `SharedArrayBuffer` (used for stdin) requires cross-origin isolation. Vite dev server sets these headers in `vite.config.ts`.
- **Pyodide WASM artifacts** — The `vite-plugin-static-copy` config in `vite.config.ts` copies Pyodide files from `node_modules` to `dist/assets/pyodide`. Changing Pyodide versions requires updating this path.
- **Service Worker scope** — The SW must be registered at the root to intercept `/pycode-server/*`. Any routing changes need to account for this.
- **No debugging support** — The IDE intentionally has no debugger; users use `print()`.

## Deployment

CI/CD via `.github/workflows/deploy.yml` — pushes to `main` trigger `npm ci && npm run build` then deploy to Cloudflare Pages via Wrangler.
