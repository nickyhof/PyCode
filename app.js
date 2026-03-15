/* ============================================================
   PyCode — Main Application
   Browser-based Python IDE using Monaco Editor + Pyodide
   ============================================================ */

(function () {
  'use strict';

  // ─── Virtual File System ──────────────────────────────────
  const vfs = new Map();

  function vfsInit() {
    const files = {
      'main.py': `"""
PyCode — Sample Project
Run this with F5 or the ▶ Run button!
"""
from lib.mathutils import fibonacci, factorial

def main():
    print("PyCode Sample Project 🐍")
    print("=" * 30)
    print()
    print("Fibonacci sequence (first 10):")
    for i in range(10):
        print(f"  fib({i}) = {fibonacci(i)}")
    print()
    print("Factorials:")
    for n in [5, 8, 10]:
        print(f"  {n}! = {factorial(n)}")
    print()
    print("Python is running in your browser!")
    print("Powered by Pyodide (CPython compiled to WebAssembly)")

if __name__ == "__main__":
    main()
`,
      'lib/__init__.py': `"""Shared library for the sample project."""
`,
      'lib/mathutils.py': `"""Math utility functions."""

def fibonacci(n: int) -> int:
    """Calculate the nth Fibonacci number."""
    if n <= 0:
        return 0
    elif n == 1:
        return 1
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

def factorial(n: int) -> int:
    """Calculate n factorial."""
    if n < 0:
        raise ValueError("Factorial is not defined for negative numbers")
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result

def greet(name: str) -> str:
    """Return a friendly greeting."""
    return f"Hello, {name}! Welcome to PyCode."
`,
      'lib/BUILD.bazel': `py_library(
    name = "mathutils",
    srcs = ["mathutils.py"],
    visibility = ["//visibility:public"],
)
`,
      'app/BUILD.bazel': `py_binary(
    name = "app",
    srcs = ["main.py"],
    main = "main.py",
    deps = ["//lib:mathutils"],
)
`,
      'app/main.py': `"""Application entry point — run with: bazel run //app:app"""
from mathutils import greet, fibonacci

def main():
    print(greet("World"))
    print()
    print("First 5 Fibonacci numbers:")
    for i in range(5):
        print(f"  fib({i}) = {fibonacci(i)}")

if __name__ == "__main__":
    main()
`,
      'tests/BUILD.bazel': `py_test(
    name = "test_mathutils",
    srcs = ["test_mathutils.py"],
    deps = ["//lib:mathutils"],
)
`,
      'tests/test_mathutils.py': `"""Tests for mathutils — run with: bazel test //tests:test_mathutils"""
from mathutils import fibonacci, factorial, greet

# Test fibonacci
assert fibonacci(0) == 0, "fib(0) should be 0"
assert fibonacci(1) == 1, "fib(1) should be 1"
assert fibonacci(10) == 55, "fib(10) should be 55"
print("✓ fibonacci tests passed")

# Test factorial
assert factorial(0) == 1, "0! should be 1"
assert factorial(5) == 120, "5! should be 120"
assert factorial(10) == 3628800, "10! should be 3628800"
print("✓ factorial tests passed")

# Test greet
result = greet("PyCode")
assert "PyCode" in result, f"Greeting should contain name, got: {result}"
print("✓ greet tests passed")

print()
print("All tests passed! ✅")
`,
      'pyproject.toml': `[project]
name = "pycode-sample"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = []

[dependency-groups]
dev = ["pytest", "pytest-cov"]
`,
            'README.md': `# PyCode Sample Project

Press **F5** or click **Run** to execute main.py.

## Terminal Commands

uv sync                            # Install dependencies
uv run main.py                     # Run a file
bazel query //...                  # List build targets
bazel run //app:app                # Run the app
bazel test //tests:test_mathutils  # Run tests
git status                         # Show changes
git clone <url>                    # Clone a repo
`,
      'data/config.json': `{
  "project": "PyCode Sample",
  "version": "1.0.0",
  "author": "You",
  "settings": {
    "debug": true,
    "max_iterations": 1000
  }
}
`
    };

    for (const [path, content] of Object.entries(files)) {
      vfsSet(path, content);
    }
  }

  function vfsSet(path, content) {
    // Normalize path
    path = path.replace(/^\/+/, '');
    vfs.set(path, { content, type: 'file' });
    // Ensure parent directories exist
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!vfs.has(dir)) {
        vfs.set(dir, { content: null, type: 'directory' });
      }
    }
  }

  function vfsGet(path) {
    return vfs.get(path.replace(/^\/+/, ''));
  }

  function vfsDelete(path) {
    path = path.replace(/^\/+/, '');
    // Delete file or recursively delete directory contents
    const toDelete = [];
    for (const key of vfs.keys()) {
      if (key === path || key.startsWith(path + '/')) {
        toDelete.push(key);
      }
    }
    toDelete.forEach(k => vfs.delete(k));
  }

  function vfsRename(oldPath, newPath) {
    oldPath = oldPath.replace(/^\/+/, '');
    newPath = newPath.replace(/^\/+/, '');
    const entries = [];
    for (const [key, val] of vfs.entries()) {
      if (key === oldPath || key.startsWith(oldPath + '/')) {
        entries.push([key, val]);
      }
    }
    entries.forEach(([key, val]) => {
      vfs.delete(key);
      const renamed = newPath + key.slice(oldPath.length);
      vfs.set(renamed, val);
    });
  }

  function vfsTree() {
    // Build a nested tree structure
    const root = { name: 'root', type: 'directory', children: {}, path: '' };

    const paths = Array.from(vfs.keys()).sort();
    for (const path of paths) {
      const entry = vfs.get(path);
      const parts = path.split('/');
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        if (!node.children[name]) {
          const childPath = parts.slice(0, i + 1).join('/');
          node.children[name] = {
            name,
            type: i < parts.length - 1 ? 'directory' : entry.type,
            children: {},
            path: childPath
          };
        }
        node = node.children[name];
      }
    }
    return root;
  }

  function vfsGetAllFiles() {
    const files = {};
    for (const [path, entry] of vfs.entries()) {
      if (entry.type === 'file') {
        files[path] = entry.content;
      }
    }
    return files;
  }

  // ─── State ────────────────────────────────────────────────
  const state = {
    openTabs: [],          // { path, dirty }
    activeTab: null,       // path
    expandedDirs: new Set(['data']),
    contextMenuTarget: null,
    pyodideReady: false,
    monacoReady: false,
    sidebarPanel: 'explorer',
    installedPackages: [],
    gitStatusMap: {},      // filepath -> status string
    showDiff: false,
  };

  let diffEditor = null;   // Monaco diff editor instance

  // ─── DOM References ──────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    fileTree: $('#file-tree'),
    tabsContainer: $('#tabs-container'),
    editorContainer: $('#editor-container'),
    welcomeView: $('#welcome-view'),
    terminalContainer: $('#terminal-container'),
    statusPyodide: $('#status-pyodide'),
    statusLanguage: $('#status-language'),
    statusCursor: $('#status-cursor'),
    titlebarFilename: $('#titlebar-filename'),
    contextMenu: $('#context-menu'),
    panel: $('#panel'),
    sidebar: $('#sidebar'),
    searchInput: $('#search-input'),
    searchResults: $('#search-results'),
    packageInput: $('#package-input'),
    stagedList: $('#staged-list'),
    changesList: $('#changes-list'),
    stagedCount: $('#staged-count'),
    changesCount: $('#changes-count'),
    gitLogList: $('#git-log-list'),
    gitBadge: $('#git-badge'),
    statusBranchName: $('#status-branch-name'),
    gitCommitMsg: $('#git-commit-msg'),
  };

  // ─── Monaco Editor ───────────────────────────────────────
  let editor = null;
  const editorModels = new Map(); // path -> monaco.editor.ITextModel

  function loadMonaco() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
      script.onload = () => {
        require.config({
          paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' }
        });

        window.MonacoEnvironment = {
          getWorkerUrl: function (moduleId, label) {
            if (label === 'json') {
              return `data:text/javascript;charset=utf-8,${encodeURIComponent(
                'self.MonacoEnvironment={baseUrl:"https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/"};importScripts("https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/base/worker/workerMain.js");'
              )}`;
            }
            return `data:text/javascript;charset=utf-8,${encodeURIComponent(
              'self.MonacoEnvironment={baseUrl:"https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/"};importScripts("https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/base/worker/workerMain.js");'
            )}`;
          }
        };

        require(['vs/editor/editor.main'], function () {
          // Define VS Code dark theme to match our CSS
          monaco.editor.defineTheme('pycode-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
              { token: 'keyword', foreground: '569CD6' },
              { token: 'string', foreground: 'CE9178' },
              { token: 'number', foreground: 'B5CEA8' },
              { token: 'type', foreground: '4EC9B0' },
              { token: 'function', foreground: 'DCDCAA' },
              { token: 'variable', foreground: '9CDCFE' },
              { token: 'operator', foreground: 'D4D4D4' },
              { token: 'decorator', foreground: 'D7BA7D' },
            ],
            colors: {
              'editor.background': '#1e1e1e',
              'editor.foreground': '#d4d4d4',
              'editorCursor.foreground': '#aeafad',
              'editor.lineHighlightBackground': '#2a2d2e',
              'editor.selectionBackground': '#264f78',
              'editor.inactiveSelectionBackground': '#3a3d41',
              'editorLineNumber.foreground': '#5a5a5a',
              'editorLineNumber.activeForeground': '#c6c6c6',
              'editorIndentGuide.background': '#404040',
              'editorIndentGuide.activeBackground': '#707070',
            }
          });

          editor = monaco.editor.create(dom.editorContainer, {
            theme: 'pycode-dark',
            fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
            fontSize: 14,
            lineHeight: 22,
            tabSize: 4,
            minimap: { enabled: false, scale: 1 },
            scrollBeyondLastLine: true,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            padding: { top: 8 },
            automaticLayout: true,
            wordWrap: 'off',
          });

          // Track cursor position
          editor.onDidChangeCursorPosition((e) => {
            dom.statusCursor.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
          });

          // Track content changes for dirty state
          editor.onDidChangeModelContent(() => {
            if (state.activeTab) {
              markTabDirty(state.activeTab, true);
            }
          });

          state.monacoReady = true;
          resolve();
        });
      };
      document.head.appendChild(script);
    });
  }

  function getLanguageForPath(path) {
    const ext = path.split('.').pop().toLowerCase();
    const map = {
      py: 'python',
      js: 'javascript',
      ts: 'typescript',
      json: 'json',
      md: 'markdown',
      html: 'html',
      css: 'css',
      txt: 'plaintext',
      yml: 'yaml',
      yaml: 'yaml',
      xml: 'xml',
      sh: 'shell',
      bash: 'shell',
      toml: 'ini',
      cfg: 'ini',
      ini: 'ini',
    };
    return map[ext] || 'plaintext';
  }

  function getOrCreateModel(path) {
    if (editorModels.has(path)) return editorModels.get(path);
    const entry = vfsGet(path);
    if (!entry || entry.type !== 'file') return null;
    const lang = getLanguageForPath(path);
    const model = monaco.editor.createModel(entry.content, lang, monaco.Uri.parse('file:///' + path));
    editorModels.set(path, model);
    return model;
  }

  // ─── Tab Management ──────────────────────────────────────
  function openFile(path) {
    const entry = vfsGet(path);
    if (!entry || entry.type !== 'file') return;

    // Add to open tabs if not already
    if (!state.openTabs.find(t => t.path === path)) {
      state.openTabs.push({ path, dirty: false });
    }

    state.activeTab = path;
    renderTabs();
    switchEditorToTab(path);
    updateWelcomeView();

    // Update status bar
    const ext = path.split('.').pop().toLowerCase();
    const langNames = { py: 'Python', js: 'JavaScript', json: 'JSON', md: 'Markdown', html: 'HTML', css: 'CSS', txt: 'Plain Text' };
    dom.statusLanguage.textContent = langNames[ext] || 'Plain Text';
    dom.titlebarFilename.textContent = path.split('/').pop();

    // Highlight in tree
    renderFileTree();
  }

  function closeTab(path) {
    const idx = state.openTabs.findIndex(t => t.path === path);
    if (idx === -1) return;

    // Dispose model
    const model = editorModels.get(path);
    if (model) {
      model.dispose();
      editorModels.delete(path);
    }

    state.openTabs.splice(idx, 1);

    if (state.activeTab === path) {
      if (state.openTabs.length > 0) {
        const newActive = state.openTabs[Math.min(idx, state.openTabs.length - 1)].path;
        state.activeTab = newActive;
        switchEditorToTab(newActive);
      } else {
        state.activeTab = null;
        dom.titlebarFilename.textContent = 'Welcome';
      }
    }

    renderTabs();
    updateWelcomeView();
  }

  function switchEditorToTab(path) {
    if (!state.monacoReady) return;
    const model = getOrCreateModel(path);
    if (model) {
      editor.setModel(model);
      dom.editorContainer.classList.add('visible');
    }
  }

  function markTabDirty(path, dirty) {
    const tab = state.openTabs.find(t => t.path === path);
    if (tab) {
      tab.dirty = dirty;
      renderTabs();
    }
  }

  function saveCurrentFile() {
    if (!state.activeTab) return;
    const model = editorModels.get(state.activeTab);
    if (!model) return;
    vfsSet(state.activeTab, model.getValue());
    markTabDirty(state.activeTab, false);
    syncFSToWorker();
    // Sync to git filesystem and refresh status
    if (GitModule.isReady()) {
      GitModule.syncVfsToGitFS(vfsGetAllFiles).then(() => refreshGitStatus());
    }
    showNotification('File saved', 'success');
  }

  function renderTabs() {
    const container = dom.tabsContainer;
    container.innerHTML = '';

    for (const tab of state.openTabs) {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.path === state.activeTab ? ' active' : '') + (tab.dirty ? ' dirty' : '');

      const iconClass = getFileIconClass(tab.path);
      el.innerHTML = `
        <span class="tab-icon codicon ${iconClass}"></span>
        <span class="tab-label">${tab.path.split('/').pop()}</span>
        <span class="tab-dirty"></span>
        <span class="tab-close codicon codicon-close" data-path="${tab.path}"></span>
      `;

      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) {
          closeTab(e.target.dataset.path);
        } else {
          state.activeTab = tab.path;
          renderTabs();
          switchEditorToTab(tab.path);
        }
      });

      // Middle-click to close
      el.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          closeTab(tab.path);
        }
      });

      container.appendChild(el);
    }
  }

  function updateWelcomeView() {
    if (state.openTabs.length === 0) {
      dom.welcomeView.classList.remove('hidden');
      dom.editorContainer.classList.remove('visible');
    } else {
      dom.welcomeView.classList.add('hidden');
      dom.editorContainer.classList.add('visible');
    }
  }

  // ─── File Tree ───────────────────────────────────────────
  function getFileIconClass(path) {
    const ext = path.split('.').pop().toLowerCase();
    const icons = {
      py: 'codicon-symbol-method',
      js: 'codicon-symbol-event',
      json: 'codicon-json',
      md: 'codicon-markdown',
      html: 'codicon-code',
      css: 'codicon-symbol-color',
      txt: 'codicon-file-text',
    };
    return icons[ext] || 'codicon-file';
  }

  function getFileColorClass(path) {
    const ext = path.split('.').pop().toLowerCase();
    const colors = {
      py: 'file-python',
      js: 'file-python',
      json: 'file-json',
      md: 'file-md',
      html: 'file-text',
      css: 'file-python',
      txt: 'file-text',
    };
    return colors[ext] || 'file-default';
  }

  function renderFileTree() {
    const tree = vfsTree();
    dom.fileTree.innerHTML = '';
    renderTreeNode(tree, dom.fileTree, 0);
  }

  function renderTreeNode(node, parent, depth) {
    // Sort: directories first, then files, alphabetical within each
    const entries = Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const child of entries) {
      const el = document.createElement('div');
      el.className = 'tree-item';
      if (state.activeTab === child.path) el.classList.add('active');

      const isDir = child.type === 'directory';
      const isExpanded = state.expandedDirs.has(child.path);

      let indent = '';
      for (let i = 0; i < depth; i++) indent += '<span class="tree-indent"></span>';

      if (isDir) {
        const iconClass = isExpanded ? 'codicon-folder-opened folder-open' : 'codicon-folder folder';
        el.innerHTML = `
          ${indent}
          <span class="tree-arrow ${isExpanded ? 'expanded' : ''} codicon codicon-chevron-right"></span>
          <span class="tree-icon ${iconClass} codicon"></span>
          <span class="tree-label">${child.name}</span>
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isExpanded) state.expandedDirs.delete(child.path);
          else state.expandedDirs.add(child.path);
          renderFileTree();
        });
      } else {
        const iconCls = getFileIconClass(child.path);
        const colorCls = getFileColorClass(child.path);
        // Git status decoration
        const gitSt = state.gitStatusMap[child.path];
        let gitBadge = '';
        let gitClass = '';
        if (gitSt) {
          const badge = gitStatusToBadge(gitSt);
          gitBadge = `<span class="tree-git-status ${badge.cls}">${badge.letter}</span>`;
          gitClass = badge.treeClass;
        }
        el.className += gitClass ? ' ' + gitClass : '';
        el.innerHTML = `
          ${indent}
          <span class="tree-arrow hidden"></span>
          <span class="tree-icon ${colorCls} codicon ${iconCls}"></span>
          <span class="tree-label">${child.name}</span>
          ${gitBadge}
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          openFile(child.path);
        });
      }

      // Context menu
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.contextMenuTarget = child.path;
        showContextMenu(e.clientX, e.clientY);
      });

      parent.appendChild(el);

      // Render children if directory is expanded
      if (isDir && isExpanded) {
        renderTreeNode(child, parent, depth + 1);
      }
    }
  }

  // ─── Context Menu ────────────────────────────────────────
  function showContextMenu(x, y) {
    const menu = dom.contextMenu;
    menu.classList.remove('hidden');
    menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
  }

  function hideContextMenu() {
    dom.contextMenu.classList.add('hidden');
  }

  document.addEventListener('click', hideContextMenu);

  $$('.ctx-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      const target = state.contextMenuTarget;
      hideContextMenu();

      switch (action) {
        case 'new-file':
          promptNewFile(target);
          break;
        case 'new-folder':
          promptNewFolder(target);
          break;
        case 'rename':
          promptRename(target);
          break;
        case 'delete':
          doDelete(target);
          break;
      }
    });
  });

  // ─── File Operations ─────────────────────────────────────
  function promptNewFile(basePath) {
    const entry = vfsGet(basePath);
    let dir = '';
    if (entry && entry.type === 'directory') {
      dir = basePath + '/';
    } else if (basePath) {
      const parts = basePath.split('/');
      if (parts.length > 1) {
        dir = parts.slice(0, -1).join('/') + '/';
      }
    }
    const name = prompt('New file name:', 'untitled.py');
    if (!name) return;
    const path = dir + name;
    vfsSet(path, '');
    syncFSToWorker();
    renderFileTree();
    openFile(path);
  }

  function promptNewFolder(basePath) {
    const entry = vfsGet(basePath);
    let dir = '';
    if (entry && entry.type === 'directory') {
      dir = basePath + '/';
    } else if (basePath) {
      const parts = basePath.split('/');
      if (parts.length > 1) {
        dir = parts.slice(0, -1).join('/') + '/';
      }
    }
    const name = prompt('New folder name:', 'new-folder');
    if (!name) return;
    const path = dir + name;
    vfs.set(path, { content: null, type: 'directory' });
    state.expandedDirs.add(path);
    syncFSToWorker();
    renderFileTree();
  }

  function promptRename(path) {
    if (!path) return;
    const oldName = path.split('/').pop();
    const newName = prompt('Rename to:', oldName);
    if (!newName || newName === oldName) return;
    const parts = path.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');

    vfsRename(path, newPath);

    // Update open tabs
    for (const tab of state.openTabs) {
      if (tab.path === path || tab.path.startsWith(path + '/')) {
        const oldTabPath = tab.path;
        tab.path = newPath + tab.path.slice(path.length);
        // Update model
        if (editorModels.has(oldTabPath)) {
          const model = editorModels.get(oldTabPath);
          editorModels.delete(oldTabPath);
          editorModels.set(tab.path, model);
        }
      }
    }
    if (state.activeTab === path || (state.activeTab && state.activeTab.startsWith(path + '/'))) {
      state.activeTab = newPath + (state.activeTab ? state.activeTab.slice(path.length) : '');
    }

    syncFSToWorker();
    renderFileTree();
    renderTabs();
  }

  function doDelete(path) {
    if (!path) return;
    if (!confirm(`Delete "${path}"?`)) return;

    // Close any open tabs for deleted files
    const toClose = state.openTabs.filter(t => t.path === path || t.path.startsWith(path + '/'));
    toClose.forEach(t => closeTab(t.path));

    vfsDelete(path);
    syncFSToWorker();
    renderFileTree();
  }

  // ─── Pyodide Worker ──────────────────────────────────────
  let pyWorker = null;

  function initPyodideWorker() {
    pyWorker = new Worker('pyodide-worker.js');

    pyWorker.onmessage = function (e) {
      const { type, data } = e.data;

      switch (type) {
        case 'ready':
          state.pyodideReady = true;
          dom.statusPyodide.innerHTML = '<span class="codicon codicon-check"></span> Python Ready';
          dom.statusPyodide.classList.remove('loading');
          dom.statusPyodide.classList.add('ready');
          termWrite('\x1b[32m✓ Python environment ready (Pyodide)\x1b[0m\r\n');
          termWritePrompt();
          syncFSToWorker();
          break;

        case 'stdout':
          termWrite(data + '\r\n');
          break;

        case 'stderr':
          termWrite('\x1b[31m' + data + '\x1b[0m\r\n');
          break;

        case 'done':
          termWrite('\r\n');
          termWritePrompt();
          break;

        case 'repl-done':
          termWritePrompt();
          break;
      }
    };

    pyWorker.postMessage({ type: 'init' });
  }

  function syncFSToWorker() {
    if (pyWorker) {
      pyWorker.postMessage({ type: 'updateFS', data: vfsGetAllFiles() });
    }
  }

  function runPython(filename) {
    if (!state.pyodideReady) {
      showNotification('Python is still loading...', 'info');
      return;
    }
    // Save all dirty files first
    for (const tab of state.openTabs) {
      if (tab.dirty) {
        const model = editorModels.get(tab.path);
        if (model) {
          vfsSet(tab.path, model.getValue());
          tab.dirty = false;
        }
      }
    }
    renderTabs();
    syncFSToWorker();

    const file = vfsGet(filename);
    if (!file || file.type !== 'file') {
      termWrite(`\x1b[31mFile not found: ${filename}\x1b[0m\r\n`);
      termWritePrompt();
      return;
    }

    // Show panel if collapsed
    dom.panel.classList.remove('collapsed');

    termWrite(`\x1b[90m$ python ${filename}\x1b[0m\r\n`);
    pyWorker.postMessage({
      type: 'run',
      data: { code: file.content, filename }
    });
  }

  // ─── Terminal (xterm.js) ─────────────────────────────────
  let term = null;
  let termFitAddon = null;
  let termInputBuffer = '';

  function initTerminal() {
    term = new window.Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#aeafad',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#d7ba7d',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f48771',
        brightGreen: '#89d185',
        brightYellow: '#dcdcaa',
        brightBlue: '#9cdcfe',
        brightMagenta: '#d19fd4',
        brightCyan: '#b5ced8',
        brightWhite: '#e7e7e7',
      },
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    });

    termFitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(termFitAddon);
    term.open(dom.terminalContainer);

    // Initial fit
    setTimeout(() => termFitAddon.fit(), 100);

    // Welcome message
    term.writeln('\x1b[1;36m╔═══════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[1;36m║       \x1b[1;37mPyCode Terminal\x1b[1;36m                ║\x1b[0m');
    term.writeln('\x1b[1;36m╚═══════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[90mLoading Python environment...\x1b[0m');
    term.writeln('');

    // Handle input
    term.onData((data) => {
      // Handle special keys
      if (data === '\r') {
        // Enter
        term.write('\r\n');
        processTerminalCommand(termInputBuffer);
        termInputBuffer = '';
      } else if (data === '\x7f') {
        // Backspace
        if (termInputBuffer.length > 0) {
          termInputBuffer = termInputBuffer.slice(0, -1);
          term.write('\b \b');
        }
      } else if (data === '\x03') {
        // Ctrl+C
        termInputBuffer = '';
        term.write('^C\r\n');
        termWritePrompt();
      } else if (data === '\x0c') {
        // Ctrl+L — clear
        term.clear();
        termWritePrompt();
      } else if (data >= ' ') {
        // Printable chars
        termInputBuffer += data;
        term.write(data);
      }
    });
  }

  function termWrite(text) {
    if (term) term.write(text);
  }

  function termWritePrompt() {
    term.write('\x1b[1;34m❯\x1b[0m ');
  }

  function processTerminalCommand(cmd) {
    cmd = cmd.trim();
    if (!cmd) {
      termWritePrompt();
      return;
    }

    if (cmd === 'clear' || cmd === 'cls') {
      term.clear();
      termWritePrompt();
      return;
    }

    if (cmd === 'help') {
      termWrite('\x1b[1mAvailable commands:\x1b[0m\r\n');
      termWrite('  \x1b[36mpython <file>\x1b[0m       Run a Python file\r\n');
      termWrite('  \x1b[36mpip install <pkg>\x1b[0m  Install a package\r\n');
      termWrite('  \x1b[36mls\x1b[0m                  List files\r\n');
      termWrite('  \x1b[36mcat <file>\x1b[0m         Display file contents\r\n');
      termWrite('  \x1b[36mgit clone \x1b[90m<url>\x1b[0m      Clone a repository\r\n');
      termWrite('  \x1b[36mgit status\x1b[0m         Show changed files\r\n');
      termWrite('  \x1b[36mgit add .\x1b[0m          Stage all changes\r\n');
      termWrite('  \x1b[36mgit add <file>\x1b[0m     Stage a file\r\n');
      termWrite('  \x1b[36mgit commit -m "…"\x1b[0m  Commit staged changes\r\n');
      termWrite('  \x1b[36mgit log\x1b[0m            Show commit history\r\n');
      termWrite('  \x1b[36mgit branch\x1b[0m         List branches\r\n');
      termWrite('  \x1b[36mgit diff <file>\x1b[0m    Show file diff\r\n');
      termWrite('  \x1b[36muv sync\x1b[0m            Install workspace deps\r\n');
      termWrite('  \x1b[36muv run \x1b[90m<file>\x1b[0m       Run a Python file\r\n');
      termWrite('  \x1b[36muv run --package \x1b[90m<pkg> <cmd>\x1b[0m  Run entrypoint\r\n');
      termWrite('  \x1b[36muv pip install \x1b[90m<pkg>\x1b[0m  Install package\r\n');
      termWrite('  \x1b[36mbazel query \x1b[90m//...\x1b[0m     List all targets\r\n');
      termWrite('  \x1b[36mbazel run \x1b[90m//pkg:tgt\x1b[0m   Run a py_binary\r\n');
      termWrite('  \x1b[36mbazel test \x1b[90m//pkg:tgt\x1b[0m  Run a py_test\r\n');
      termWrite('  \x1b[36mclear\x1b[0m              Clear terminal\r\n');
      termWrite('  \x1b[36mhelp\x1b[0m               Show this help\r\n');
      termWrite('\r\n');
      termWrite('\x1b[90mOr type Python code directly to run it.\x1b[0m\r\n');
      termWritePrompt();
      return;
    }

    if (cmd === 'ls') {
      const files = Array.from(vfs.keys()).sort();
      for (const f of files) {
        const entry = vfs.get(f);
        if (entry.type === 'directory') {
          termWrite(`\x1b[34m${f}/\x1b[0m\r\n`);
        } else {
          termWrite(`${f}\r\n`);
        }
      }
      termWritePrompt();
      return;
    }

    if (cmd.startsWith('cat ')) {
      const path = cmd.slice(4).trim();
      const entry = vfsGet(path);
      if (entry && entry.type === 'file') {
        termWrite(entry.content.replace(/\n/g, '\r\n'));
        if (!entry.content.endsWith('\n')) termWrite('\r\n');
      } else {
        termWrite(`\x1b[31mFile not found: ${path}\x1b[0m\r\n`);
      }
      termWritePrompt();
      return;
    }

    if (cmd.startsWith('python ') || cmd.startsWith('python3 ')) {
      const filename = cmd.replace(/^python3?\s+/, '').trim();
      runPython(filename);
      return;
    }

    if (cmd === 'python' || cmd === 'python3') {
      termWrite('\x1b[33mInteractive Python REPL is not supported yet.\x1b[0m\r\n');
      termWrite('\x1b[33mUse "python <filename>" to run a file, or type Python code directly.\x1b[0m\r\n');
      termWritePrompt();
      return;
    }

    if (cmd.startsWith('pip install ') || cmd.startsWith('pip3 install ')) {
      const pkg = cmd.replace(/^pip3?\s+install\s+/, '').trim();
      if (pkg) {
        pyWorker.postMessage({ type: 'install', data: { package: pkg } });
        state.installedPackages.push(pkg);
        renderInstalledPackages();
      }
      return;
    }

    // Git commands
    if (cmd.startsWith('git ')) {
      handleGitCommand(cmd);
      return;
    }

    // UV commands
    if (cmd.startsWith('uv ')) {
      handleUvCommand(cmd);
      return;
    }

    // Bazel commands
    if (cmd.startsWith('bazel ')) {
      handleBazelCommand(cmd);
      return;
    }

    // Try to run as Python code
    if (state.pyodideReady) {
      pyWorker.postMessage({ type: 'repl', data: { code: cmd } });
    } else {
      termWrite('\x1b[31mPython is not ready yet.\x1b[0m\r\n');
      termWritePrompt();
    }
  }

  // ─── Lightweight TOML Parser ──────────────────────────────
  // Handles tables, arrays-of-strings, key-value strings, and inline tables.
  // Enough for pyproject.toml parsing — not a full TOML spec implementation.
  function parseTOML(text) {
    const result = {};
    let current = result;
    let currentPath = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Skip comments and blank lines
      if (!line || line.startsWith('#')) continue;

      // Array of tables [[section.name]]
      let m = line.match(/^\[\[([^\]]+)\]\]/);
      if (m) {
        const path = m[1].split('.');
        let obj = result;
        for (let p = 0; p < path.length; p++) {
          const key = path[p].trim().replace(/^"|"$/g, '');
          if (p === path.length - 1) {
            if (!obj[key]) obj[key] = [];
            const entry = {};
            obj[key].push(entry);
            current = entry;
          } else {
            if (!obj[key]) obj[key] = {};
            obj = obj[key];
          }
        }
        continue;
      }

      // Table header [section.name]
      m = line.match(/^\[([^\]]+)\]/);
      if (m) {
        const path = m[1].split('.');
        current = result;
        for (const key of path) {
          const k = key.trim().replace(/^"|"$/g, '');
          if (!current[k]) current[k] = {};
          current = current[k];
        }
        currentPath = path;
        continue;
      }

      // Key = value
      m = line.match(/^([^=]+)=(.*)$/);
      if (m) {
        let key = m[1].trim().replace(/^"|"$/g, '');
        let val = m[2].trim();

        // Multi-line array
        if (val.startsWith('[') && !val.includes(']')) {
          let arr = val;
          while (i + 1 < lines.length && !arr.includes(']')) {
            i++;
            arr += ' ' + lines[i].trim();
          }
          val = arr;
        }

        current[key] = parseTOMLValue(val);
      }
    }
    return result;
  }

  function parseTOMLValue(val) {
    val = val.trim();
    // Remove trailing inline comment
    const commentMatch = val.match(/^("[^"]*"|'[^']*'|\[[^\]]*\]|\{[^}]*\}|[^#]*)#/);
    if (commentMatch) val = commentMatch[1].trim();

    // String
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    // Boolean
    if (val === 'true') return true;
    if (val === 'false') return false;
    // Number
    if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
    // Array
    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1).trim();
      if (!inner) return [];
      // Split on commas, respecting quotes
      const items = [];
      let buf = '';
      let inQuote = false;
      let quoteChar = '';
      let braces = 0;
      for (let c = 0; c < inner.length; c++) {
        const ch = inner[c];
        if (inQuote) {
          buf += ch;
          if (ch === quoteChar) inQuote = false;
        } else if (ch === '{') {
          braces++;
          buf += ch;
        } else if (ch === '}') {
          braces--;
          buf += ch;
        } else if (ch === ',' && braces === 0) {
          const trimmed = buf.trim();
          if (trimmed) items.push(parseTOMLValue(trimmed));
          buf = '';
        } else {
          if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; }
          buf += ch;
        }
      }
      const last = buf.trim();
      if (last) items.push(parseTOMLValue(last));
      return items;
    }
    // Inline table { key = val, ... }
    if (val.startsWith('{') && val.endsWith('}')) {
      const inner = val.slice(1, -1).trim();
      const obj = {};
      if (!inner) return obj;
      const parts = inner.split(',');
      for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq !== -1) {
          const k = part.slice(0, eq).trim().replace(/^"|"$/g, '');
          obj[k] = parseTOMLValue(part.slice(eq + 1).trim());
        }
      }
      return obj;
    }
    return val;
  }

  // ─── UV Commands ────────────────────────────────────────────
  function findAllPyprojectTomls() {
    const results = {};
    for (const [path, entry] of vfs.entries()) {
      if (entry.type === 'file' && path.endsWith('pyproject.toml')) {
        results[path] = entry.content;
      }
    }
    return results;
  }

  function findWorkspaceMembers() {
    // Find member pyproject.toml files (not the root one)
    const all = findAllPyprojectTomls();
    const members = {};
    for (const [path, content] of Object.entries(all)) {
      if (path !== 'pyproject.toml') {
        members[path] = parseTOML(content);
      }
    }
    return members;
  }

  function findWorkspaceSrcPaths() {
    // Find src/ directories for workspace members
    const paths = [];
    const allFiles = vfsGetAllFiles();
    const srcDirs = new Set();
    for (const filePath of Object.keys(allFiles)) {
      // Match patterns like libs/shared/src/shared/__init__.py or apps/myapp/src/myapp/__init__.py
      const m = filePath.match(/^(.+\/src)\//);
      if (m) srcDirs.add('/' + m[1]);
    }
    return Array.from(srcDirs);
  }

  async function handleUvCommand(cmd) {
    const parts = cmd.split(/\s+/);
    const subCmd = parts[1];

    try {
      switch (subCmd) {
        case 'sync': {
          termWrite('\x1b[36mResolving workspace...\x1b[0m\r\n');

          // Parse root pyproject.toml
          const rootToml = vfsGet('pyproject.toml');
          if (!rootToml || rootToml.type !== 'file') {
            termWrite('\x1b[31mNo pyproject.toml found in workspace root\x1b[0m\r\n');
            break;
          }
          const root = parseTOML(rootToml.content);

          // Find workspace members
          const members = findWorkspaceMembers();
          const memberNames = Object.entries(members)
            .map(([p, m]) => m.project?.name || p.split('/').slice(-2, -1)[0])
            .filter(Boolean);

          termWrite(`\x1b[90m  Workspace: ${root.project?.name || 'unknown'}\x1b[0m\r\n`);
          if (memberNames.length > 0) {
            termWrite(`\x1b[90m  Members: ${memberNames.join(', ')}\x1b[0m\r\n`);
          }

          // Collect third-party deps from dependency-groups
          const depGroups = root['dependency-groups'] || {};
          const allDeps = [];
          // Native/compiled packages that cannot run in the browser (no pure-Python wheel)
          const nativeSkipList = new Set([
            'ruff', 'ty', 'pre-commit', 'import-linter', 'mypy', 'black',
            'pyright', 'pylint', 'isort', 'flake8', 'bandit', 'safety',
            'uvicorn', 'gunicorn', 'uvloop', 'watchdog', 'psutil',
          ]);
          const skippedDeps = [];

          for (const [group, deps] of Object.entries(depGroups)) {
            if (Array.isArray(deps)) {
              for (const dep of deps) {
                const depName = typeof dep === 'string' ? dep.split(/[>=<\[]/)[0].trim() : '';
                if (!depName || memberNames.includes(depName)) continue;
                if (nativeSkipList.has(depName)) {
                  skippedDeps.push(depName);
                } else {
                  allDeps.push(depName);
                }
              }
            }
          }

          // Also collect root project.dependencies
          const rootDeps = root.project?.dependencies || [];
          for (const dep of rootDeps) {
            const depName = typeof dep === 'string' ? dep.split(/[>=<\[]/)[0].trim() : '';
            if (!depName || memberNames.includes(depName) || allDeps.includes(depName)) continue;
            if (nativeSkipList.has(depName)) {
              skippedDeps.push(depName);
            } else {
              allDeps.push(depName);
            }
          }

          // Show skipped packages
          if (skippedDeps.length > 0) {
            termWrite(`\x1b[33mSkipping ${skippedDeps.length} native package(s) (no WASM support):\x1b[0m\r\n`);
            termWrite(`\x1b[90m  ${skippedDeps.join(', ')}\x1b[0m\r\n`);
          }

          // Install third-party deps via micropip
          if (allDeps.length > 0) {
            termWrite(`\x1b[36mInstalling ${allDeps.length} package(s)...\x1b[0m\r\n`);
            for (const dep of allDeps) {
              termWrite(`\x1b[90m  → ${dep}\x1b[0m\r\n`);
              try {
                pyWorker.postMessage({ type: 'install', data: { package: dep } });
              } catch (e) {
                termWrite(`\x1b[33m  ⚠ ${dep}: ${e.message}\x1b[0m\r\n`);
              }
            }
            // Brief wait for installations to process
            await new Promise(r => setTimeout(r, 500));
          } else {
            termWrite('\x1b[90m  No third-party dependencies to install\x1b[0m\r\n');
          }

          // Configure sys.path for workspace src-layout imports
          const srcPaths = findWorkspaceSrcPaths();
          if (srcPaths.length > 0) {
            termWrite(`\x1b[36mConfiguring workspace paths...\x1b[0m\r\n`);
            for (const p of srcPaths) {
              termWrite(`\x1b[90m  → ${p}\x1b[0m\r\n`);
            }
            syncFSToWorker();
            pyWorker.postMessage({ type: 'configurePaths', data: { paths: srcPaths } });
          }

          termWrite('\x1b[32m✓ Workspace synced\x1b[0m\r\n');
          break;
        }

        case 'run': {
          // uv run --package <pkg> <entry> OR uv run <file.py>
          if (parts[2] === '--package' && parts[3] && parts[4]) {
            const pkgName = parts[3];
            const entryName = parts[4];

            // Find the member's pyproject.toml
            const members = findWorkspaceMembers();
            let entrypoint = null;

            for (const [path, parsed] of Object.entries(members)) {
              if (parsed.project?.name === pkgName) {
                const scripts = parsed.project?.scripts || {};
                entrypoint = scripts[entryName];
                break;
              }
            }

            if (entrypoint) {
              termWrite(`\x1b[90m$ uv run --package ${pkgName} ${entryName}\x1b[0m\r\n`);
              termWrite(`\x1b[90m  → ${entrypoint}\x1b[0m\r\n`);
              syncFSToWorker();
              pyWorker.postMessage({ type: 'runEntrypoint', data: { entrypoint } });
            } else {
              termWrite(`\x1b[31mNo script '${entryName}' found in package '${pkgName}'\x1b[0m\r\n`);
              // List available scripts
              for (const [path, parsed] of Object.entries(members)) {
                const scripts = parsed.project?.scripts;
                if (scripts && Object.keys(scripts).length > 0) {
                  termWrite(`\x1b[90m  ${parsed.project?.name}: ${Object.keys(scripts).join(', ')}\x1b[0m\r\n`);
                }
              }
            }
          } else if (parts[2]) {
            // uv run <file.py> — just run as python
            const filename = parts.slice(2).join(' ');
            runPython(filename);
            return; // runPython handles prompt
          } else {
            termWrite('\x1b[33mUsage: uv run <file.py> or uv run --package <pkg> <script>\x1b[0m\r\n');
          }
          break;
        }

        case 'pip': {
          // uv pip install <pkg>
          if (parts[2] === 'install' && parts[3]) {
            const pkg = parts.slice(3).join(' ');
            termWrite(`\x1b[36mInstalling ${pkg}...\x1b[0m\r\n`);
            pyWorker.postMessage({ type: 'install', data: { package: pkg } });
            state.installedPackages.push(pkg);
            renderInstalledPackages();
          } else {
            termWrite('\x1b[33mUsage: uv pip install <package>\x1b[0m\r\n');
          }
          break;
        }

        default:
          termWrite(`\x1b[33mUnknown uv command: ${subCmd}\x1b[0m\r\n`);
          termWrite('\x1b[90mAvailable: sync, run, pip install\x1b[0m\r\n');
      }
    } catch (err) {
      termWrite(`\x1b[31muv error: ${err.message}\x1b[0m\r\n`);
    }
    termWritePrompt();
  }

  // ─── Bazel BUILD Parser ──────────────────────────────────
  // Extracts py_binary, py_library, py_test targets from BUILD.bazel files.
  function parseBUILD(text) {
    const targets = [];
    const rulePattern = /(py_binary|py_library|py_test)\s*\(/g;
    let match;

    while ((match = rulePattern.exec(text)) !== null) {
      const rule = match[1];
      const startIdx = match.index + match[0].length;

      // Find matching closing paren
      let depth = 1;
      let pos = startIdx;
      while (pos < text.length && depth > 0) {
        if (text[pos] === '(') depth++;
        else if (text[pos] === ')') depth--;
        pos++;
      }
      const body = text.slice(startIdx, pos - 1);

      // Extract named arguments from the body
      const target = { rule };
      target.name = extractBazelArg(body, 'name');
      target.srcs = extractBazelListArg(body, 'srcs');
      target.main = extractBazelArg(body, 'main');
      target.deps = extractBazelListArg(body, 'deps');
      target.imports = extractBazelListArg(body, 'imports');

      if (target.name) targets.push(target);
    }
    return targets;
  }

  function extractBazelArg(body, argName) {
    // Match: argName = "value" or argName = 'value'
    const re = new RegExp(argName + '\\s*=\\s*["\']([^"\']*)["\']');
    const m = body.match(re);
    return m ? m[1] : null;
  }

  function extractBazelListArg(body, argName) {
    // Match: argName = ["a", "b", ...]
    const re = new RegExp(argName + '\\s*=\\s*\\[([^\\]]*?)\\]', 's');
    const m = body.match(re);
    if (!m) return [];
    const items = [];
    const itemRe = /["']([^"']*)["']/g;
    let im;
    while ((im = itemRe.exec(m[1])) !== null) {
      items.push(im[1]);
    }
    return items;
  }

  // ─── Bazel Target Resolution ─────────────────────────────
  function findAllBUILDFiles() {
    const results = {};
    for (const [path, entry] of vfs.entries()) {
      if (entry.type === 'file' && (path.endsWith('/BUILD') || path.endsWith('/BUILD.bazel') || path === 'BUILD' || path === 'BUILD.bazel')) {
        results[path] = { content: entry.content, targets: parseBUILD(entry.content) };
      }
    }
    return results;
  }

  function buildFilePkg(buildPath) {
    // Convert BUILD file path to package path
    // e.g. "app/BUILD.bazel" -> "app", "BUILD.bazel" -> ""
    const dir = buildPath.replace(/\/?BUILD(\.bazel)?$/, '');
    return dir;
  }

  function resolveBazelTarget(label) {
    // Parse //pkg:name or //:name or :name
    let pkg = '';
    let name = '';
    if (label.startsWith('//')) {
      const rest = label.slice(2);
      const colonIdx = rest.indexOf(':');
      if (colonIdx !== -1) {
        pkg = rest.slice(0, colonIdx);
        name = rest.slice(colonIdx + 1);
      } else {
        pkg = rest;
        name = rest.split('/').pop(); // default target = last component
      }
    } else if (label.startsWith(':')) {
      name = label.slice(1);
    } else {
      name = label;
    }

    const buildFiles = findAllBUILDFiles();

    // Find the BUILD file for this package
    for (const [buildPath, buildData] of Object.entries(buildFiles)) {
      const filePkg = buildFilePkg(buildPath);
      if (filePkg === pkg) {
        const target = buildData.targets.find(t => t.name === name);
        if (target) {
          return { target, pkg: filePkg, buildPath };
        }
      }
    }
    return null;
  }

  function collectBazelDeps(target, pkg, visited = new Set()) {
    // Collect source directories for sys.path from transitive deps
    const paths = new Set();
    if (pkg) paths.add('/' + pkg);

    for (const dep of (target.deps || [])) {
      if (visited.has(dep)) continue;
      visited.add(dep);

      const resolved = resolveBazelTarget(dep);
      if (resolved) {
        if (resolved.pkg) paths.add('/' + resolved.pkg);
        // Recurse into deps
        const subPaths = collectBazelDeps(resolved.target, resolved.pkg, visited);
        for (const p of subPaths) paths.add(p);
      }
    }
    return Array.from(paths);
  }

  // ─── Bazel Commands ─────────────────────────────────────
  async function handleBazelCommand(cmd) {
    const parts = cmd.split(/\s+/);
    const subCmd = parts[1];

    try {
      switch (subCmd) {
        case 'query': {
          const pattern = parts.slice(2).join(' ').trim() || '//...';
          const buildFiles = findAllBUILDFiles();
          let totalTargets = 0;

          termWrite(`\x1b[36mQuerying targets matching ${pattern}\x1b[0m\r\n`);

          for (const [buildPath, buildData] of Object.entries(buildFiles)) {
            const pkg = buildFilePkg(buildPath);
            for (const target of buildData.targets) {
              const label = `//${pkg}:${target.name}`;
              const ruleColor = target.rule === 'py_binary' ? '32' :
                               target.rule === 'py_test' ? '33' : '36';
              termWrite(`\x1b[${ruleColor}m${target.rule}\x1b[0m ${label}\r\n`);
              totalTargets++;
            }
          }

          if (totalTargets === 0) {
            termWrite('\x1b[90mNo BUILD files or py_* targets found\x1b[0m\r\n');
          } else {
            termWrite(`\x1b[90m${totalTargets} target(s) found\x1b[0m\r\n`);
          }
          break;
        }

        case 'run': {
          const label = parts[2];
          if (!label) {
            termWrite('\x1b[33mUsage: bazel run //package:target\x1b[0m\r\n');
            break;
          }

          const resolved = resolveBazelTarget(label);
          if (!resolved) {
            termWrite(`\x1b[31mTarget not found: ${label}\x1b[0m\r\n`);
            break;
          }

          const { target, pkg } = resolved;
          if (target.rule !== 'py_binary') {
            termWrite(`\x1b[33m${label} is a ${target.rule}, not a py_binary. Use 'bazel test' for py_test targets.\x1b[0m\r\n`);
            break;
          }

          // Resolve main file
          const mainFile = target.main || (target.srcs && target.srcs[0]);
          if (!mainFile) {
            termWrite(`\x1b[31mNo main file found for ${label}\x1b[0m\r\n`);
            break;
          }

          const fullPath = pkg ? `${pkg}/${mainFile}` : mainFile;

          // Collect dep paths for sys.path
          const depPaths = collectBazelDeps(target, pkg);
          if (depPaths.length > 0) {
            syncFSToWorker();
            pyWorker.postMessage({ type: 'configurePaths', data: { paths: depPaths } });
            // Brief wait for paths to configure
            await new Promise(r => setTimeout(r, 200));
          }

          termWrite(`\x1b[90m$ bazel run ${label}\x1b[0m\r\n`);
          termWrite(`\x1b[90m  → ${fullPath}\x1b[0m\r\n`);
          runPython(fullPath);
          return; // runPython handles prompt
        }

        case 'test': {
          const label = parts[2];
          if (!label) {
            termWrite('\x1b[33mUsage: bazel test //package:target\x1b[0m\r\n');
            break;
          }

          const resolved = resolveBazelTarget(label);
          if (!resolved) {
            termWrite(`\x1b[31mTarget not found: ${label}\x1b[0m\r\n`);
            break;
          }

          const { target, pkg } = resolved;
          if (target.rule !== 'py_test') {
            termWrite(`\x1b[33m${label} is a ${target.rule}, not a py_test. Use 'bazel run' for py_binary targets.\x1b[0m\r\n`);
            break;
          }

          const testFile = target.main || (target.srcs && target.srcs[0]);
          if (!testFile) {
            termWrite(`\x1b[31mNo test file found for ${label}\x1b[0m\r\n`);
            break;
          }

          const fullPath = pkg ? `${pkg}/${testFile}` : testFile;

          // Collect dep paths
          const depPaths = collectBazelDeps(target, pkg);
          if (depPaths.length > 0) {
            syncFSToWorker();
            pyWorker.postMessage({ type: 'configurePaths', data: { paths: depPaths } });
            await new Promise(r => setTimeout(r, 200));
          }

          termWrite(`\x1b[90m$ bazel test ${label}\x1b[0m\r\n`);
          termWrite(`\x1b[90m  → ${fullPath}\x1b[0m\r\n`);
          runPython(fullPath);
          return; // runPython handles prompt
        }

        case 'build': {
          const label = parts[2];
          if (!label) {
            termWrite('\x1b[33mUsage: bazel build //package:target\x1b[0m\r\n');
            break;
          }

          const resolved = resolveBazelTarget(label);
          if (!resolved) {
            termWrite(`\x1b[31mTarget not found: ${label}\x1b[0m\r\n`);
            break;
          }

          const { target, pkg } = resolved;
          const depPaths = collectBazelDeps(target, pkg);

          termWrite(`\x1b[32m✓ ${label} (${target.rule})\x1b[0m\r\n`);
          if (target.srcs && target.srcs.length > 0) {
            termWrite(`\x1b[90m  srcs: ${target.srcs.join(', ')}\x1b[0m\r\n`);
          }
          if (target.deps && target.deps.length > 0) {
            termWrite(`\x1b[90m  deps: ${target.deps.join(', ')}\x1b[0m\r\n`);
          }
          termWrite('\x1b[32mBuild completed successfully\x1b[0m\r\n');
          break;
        }

        default:
          termWrite(`\x1b[33mUnknown bazel command: ${subCmd}\x1b[0m\r\n`);
          termWrite('\x1b[90mAvailable: query, run, test, build\x1b[0m\r\n');
      }
    } catch (err) {
      termWrite(`\x1b[31mBazel error: ${err.message}\x1b[0m\r\n`);
    }
    termWritePrompt();
  }

  // ─── Clone Repo Orchestration ───────────────────────────
  async function cloneRepo(url) {
    const overlay = $('#clone-overlay');
    const statusEl = $('#clone-overlay-status');

    // Show overlay
    overlay.classList.remove('hidden');
    statusEl.textContent = 'Connecting...';

    // Show in terminal
    dom.panel.classList.remove('collapsed');
    termWrite(`\x1b[90m$ git clone ${url}\x1b[0m\r\n`);
    termWrite('\x1b[33mCloning repository...\x1b[0m\r\n');

    try {
      await GitModule.clone(url, (progress) => {
        const msg = progress.phase || 'Working...';
        const detail = progress.loaded
          ? ` (${progress.loaded}${progress.total ? '/' + progress.total : ''} objects)`
          : '';
        statusEl.textContent = msg + detail;
        termWrite(`\x1b[90m  ${msg}${detail}\x1b[0m\r\n`);
      });

      // Sync cloned files from git FS to VFS
      vfs.clear();
      await GitModule.syncGitFSToVfs(vfsSet, () => vfs.clear());

      // Close all open tabs
      state.openTabs.forEach(t => {
        const m = editorModels.get(t.path);
        if (m) m.dispose();
        editorModels.delete(t.path);
      });
      state.openTabs = [];
      state.activeTab = null;

      // Refresh everything
      renderFileTree();
      renderTabs();
      updateWelcomeView();
      syncFSToWorker();
      await refreshGitStatus();

      const branch = await GitModule.currentBranch();
      termWrite(`\x1b[32m✓ Cloned into workspace (branch: ${branch})\x1b[0m\r\n`);
      showNotification('Repository cloned successfully', 'success');
    } catch (err) {
      termWrite(`\x1b[31m✗ Clone failed: ${err.message}\x1b[0m\r\n`);
      showNotification(`Clone failed: ${err.message}`, 'error');
    } finally {
      overlay.classList.add('hidden');
      termWritePrompt();
    }
  }

  // ─── Git Terminal Commands ──────────────────────────────
  async function handleGitCommand(cmd) {
    const parts = cmd.split(/\s+/);
    const subCmd = parts[1];

    // Clone does not require git to already be initialized
    if (subCmd === 'clone') {
      const url = parts[2];
      if (!url) {
        termWrite('\x1b[33mUsage: git clone <url>\x1b[0m\r\n');
        termWritePrompt();
      } else {
        await cloneRepo(url);
      }
      return;
    }

    if (!GitModule.isReady()) {
      termWrite('\x1b[31mGit is not initialized yet.\x1b[0m\r\n');
      termWritePrompt();
      return;
    }

    try {
      switch (subCmd) {
        case 'status': {
          const statusList = await GitModule.status();
          if (statusList.length === 0) {
            termWrite('\x1b[32mNothing to commit, working tree clean\x1b[0m\r\n');
          } else {
            const branch = await GitModule.currentBranch();
            termWrite(`On branch \x1b[36m${branch}\x1b[0m\r\n\r\n`);
            const staged = statusList.filter(s => ['staged', 'added', 'staged-modified', 'deleted-staged'].includes(s.status));
            const unstaged = statusList.filter(s => ['modified', 'deleted', 'untracked', 'added-modified'].includes(s.status));
            if (staged.length > 0) {
              termWrite('\x1b[32mChanges to be committed:\x1b[0m\r\n');
              for (const s of staged) {
                termWrite(`  \x1b[32m${gitStatusLabel(s.status)}:\x1b[0m   ${s.filepath}\r\n`);
              }
              termWrite('\r\n');
            }
            if (unstaged.length > 0) {
              termWrite('\x1b[31mChanges not staged for commit:\x1b[0m\r\n');
              for (const s of unstaged) {
                termWrite(`  \x1b[31m${gitStatusLabel(s.status)}:\x1b[0m   ${s.filepath}\r\n`);
              }
            }
          }
          break;
        }

        case 'add': {
          const target = parts.slice(2).join(' ').trim();
          if (target === '.' || target === '--all' || target === '-A') {
            await GitModule.addAll(vfsGetAllFiles);
            termWrite('\x1b[32mAll changes staged.\x1b[0m\r\n');
          } else if (target) {
            await GitModule.syncVfsToGitFS(vfsGetAllFiles);
            await GitModule.add(target);
            termWrite(`\x1b[32mStaged: ${target}\x1b[0m\r\n`);
          } else {
            termWrite('\x1b[33mUsage: git add <file> or git add .\x1b[0m\r\n');
          }
          await refreshGitStatus();
          break;
        }

        case 'commit': {
          let msg = '';
          const mIdx = parts.indexOf('-m');
          if (mIdx !== -1) {
            msg = cmd.slice(cmd.indexOf('-m') + 2).trim();
            // Strip surrounding quotes
            if ((msg.startsWith('"') && msg.endsWith('"')) || (msg.startsWith("'") && msg.endsWith("'"))) {
              msg = msg.slice(1, -1);
            }
          }
          if (!msg) {
            termWrite('\x1b[33mUsage: git commit -m "your message"\x1b[0m\r\n');
          } else {
            const sha = await GitModule.commit(msg);
            if (sha) {
              termWrite(`\x1b[32m[${(await GitModule.currentBranch())} ${sha.slice(0, 7)}] ${msg}\x1b[0m\r\n`);
              await refreshGitStatus();
            }
          }
          break;
        }

        case 'log': {
          const commits = await GitModule.log(15);
          for (const c of commits) {
            termWrite(`\x1b[33m${c.sha}\x1b[0m ${c.message.trim()}`);
            termWrite(` \x1b[90m(${c.dateStr})\x1b[0m\r\n`);
          }
          if (commits.length === 0) {
            termWrite('\x1b[90mNo commits yet.\x1b[0m\r\n');
          }
          break;
        }

        case 'branch': {
          if (parts[2]) {
            await GitModule.createBranch(parts[2]);
            termWrite(`\x1b[32mCreated branch: ${parts[2]}\x1b[0m\r\n`);
          } else {
            const branches = await GitModule.listBranches();
            const current = await GitModule.currentBranch();
            for (const b of branches) {
              const marker = b === current ? '\x1b[32m* ' : '  ';
              termWrite(`${marker}${b}\x1b[0m\r\n`);
            }
          }
          break;
        }

        case 'checkout': {
          if (parts[2]) {
            if (parts[2] === '-b' && parts[3]) {
              await GitModule.createBranch(parts[3]);
              await GitModule.checkout(parts[3]);
              termWrite(`\x1b[32mSwitched to new branch '${parts[3]}'\x1b[0m\r\n`);
            } else {
              await GitModule.checkout(parts[2]);
              termWrite(`\x1b[32mSwitched to branch '${parts[2]}'\x1b[0m\r\n`);
            }
            // Reload files from the new branch
            await GitModule.syncGitFSToVfs(vfsSet, () => vfs.clear());
            renderFileTree();
            // Close all tabs and reopen
            state.openTabs.forEach(t => {
              const m = editorModels.get(t.path);
              if (m) m.dispose();
              editorModels.delete(t.path);
            });
            state.openTabs = [];
            state.activeTab = null;
            renderTabs();
            updateWelcomeView();
            syncFSToWorker();
            await refreshGitStatus();
          } else {
            termWrite('\x1b[33mUsage: git checkout <branch>\x1b[0m\r\n');
          }
          break;
        }

        case 'diff': {
          const filepath = parts.slice(2).join(' ').trim();
          if (!filepath) {
            termWrite('\x1b[33mUsage: git diff <file>\x1b[0m\r\n');
          } else {
            const d = await GitModule.diff(filepath);
            if (d.oldContent === d.newContent) {
              termWrite(`\x1b[90mNo changes in ${filepath}\x1b[0m\r\n`);
            } else {
              // Simple diff display in terminal
              const oldLines = d.oldContent.split('\n');
              const newLines = d.newContent.split('\n');
              termWrite(`\x1b[1mdiff ${filepath}\x1b[0m\r\n`);
              termWrite(`\x1b[36m--- a/${filepath}\x1b[0m\r\n`);
              termWrite(`\x1b[36m+++ b/${filepath}\x1b[0m\r\n`);
              // Show simple line-by-line comparison (limited)
              const maxLen = Math.max(oldLines.length, newLines.length);
              for (let i = 0; i < Math.min(maxLen, 30); i++) {
                const oLine = oldLines[i];
                const nLine = newLines[i];
                if (oLine === undefined) {
                  termWrite(`\x1b[32m+ ${nLine}\x1b[0m\r\n`);
                } else if (nLine === undefined) {
                  termWrite(`\x1b[31m- ${oLine}\x1b[0m\r\n`);
                } else if (oLine !== nLine) {
                  termWrite(`\x1b[31m- ${oLine}\x1b[0m\r\n`);
                  termWrite(`\x1b[32m+ ${nLine}\x1b[0m\r\n`);
                }
              }
              if (maxLen > 30) {
                termWrite(`\x1b[90m... (${maxLen - 30} more lines)\x1b[0m\r\n`);
              }
            }
          }
          break;
        }

        default:
          termWrite(`\x1b[33mUnknown git command: ${subCmd}\x1b[0m\r\n`);
          termWrite('\x1b[90mAvailable: clone, status, add, commit, log, branch, checkout, diff\x1b[0m\r\n');
      }
    } catch (err) {
      termWrite(`\x1b[31mGit error: ${err.message}\x1b[0m\r\n`);
    }
    termWritePrompt();
  }

  function gitStatusLabel(status) {
    const labels = {
      'modified': 'modified',
      'added': 'new file',
      'added-modified': 'new file',
      'deleted': 'deleted',
      'deleted-staged': 'deleted',
      'staged': 'modified',
      'staged-modified': 'modified',
      'untracked': 'untracked',
    };
    return labels[status] || status;
  }

  // ─── Installed Packages List ─────────────────────────────
  function renderInstalledPackages() {
    const container = $('#installed-packages');
    if (!container) return;
    container.innerHTML = state.installedPackages.map(pkg => `
      <div class="installed-pkg">
        <span class="codicon codicon-package"></span>
        ${pkg}
      </div>
    `).join('');
  }

  // ─── Search ──────────────────────────────────────────────
  function initSearch() {
    dom.searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      if (!query) {
        dom.searchResults.innerHTML = '';
        return;
      }

      const results = [];
      for (const [path, entry] of vfs.entries()) {
        if (entry.type !== 'file') continue;
        const lines = entry.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const idx = lines[i].toLowerCase().indexOf(query);
          if (idx !== -1) {
            results.push({
              path,
              line: i + 1,
              content: lines[i],
              matchStart: idx,
              matchEnd: idx + query.length
            });
          }
        }
      }

      dom.searchResults.innerHTML = '';
      if (results.length === 0) {
        dom.searchResults.innerHTML = '<div style="padding:8px;color:var(--fg-muted);">No results found</div>';
        return;
      }

      // Group by file
      const grouped = {};
      for (const r of results) {
        if (!grouped[r.path]) grouped[r.path] = [];
        grouped[r.path].push(r);
      }

      for (const [path, matches] of Object.entries(grouped)) {
        const fileEl = document.createElement('div');
        fileEl.className = 'search-result-item';
        fileEl.innerHTML = `<div class="search-result-file">${path} (${matches.length})</div>`;
        fileEl.addEventListener('click', () => openFile(path));
        dom.searchResults.appendChild(fileEl);

        for (const m of matches.slice(0, 5)) {
          const lineEl = document.createElement('div');
          lineEl.className = 'search-result-item';
          const before = escapeHtml(m.content.substring(Math.max(0, m.matchStart - 20), m.matchStart));
          const match = escapeHtml(m.content.substring(m.matchStart, m.matchEnd));
          const after = escapeHtml(m.content.substring(m.matchEnd, m.matchEnd + 30));
          lineEl.innerHTML = `<div class="search-result-line">L${m.line}: ${before}<span class="search-result-match">${match}</span>${after}</div>`;
          lineEl.addEventListener('click', () => {
            openFile(path);
            if (editor) {
              editor.revealLineInCenter(m.line);
              editor.setPosition({ lineNumber: m.line, column: m.matchStart + 1 });
            }
          });
          dom.searchResults.appendChild(lineEl);
        }
      }
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Sidebar Panels ─────────────────────────────────────
  function initSidebarPanels() {
    $$('.activity-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        if (!panel) return;

        // Toggle sidebar if clicking active panel
        if (state.sidebarPanel === panel) {
          dom.sidebar.classList.toggle('collapsed');
        } else {
          dom.sidebar.classList.remove('collapsed');
        }

        state.sidebarPanel = panel;

        // Update active states
        $$('.activity-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $$('.sidebar-panel').forEach(p => p.classList.remove('active'));
        $(`#sidebar-${panel}`).classList.add('active');
      });
    });
  }

  // ─── Resize Handles ─────────────────────────────────────
  function initResizeHandles() {
    // Sidebar resize
    const sidebarResize = $('#sidebar-resize');
    let sidebarDragging = false;

    sidebarResize.addEventListener('mousedown', (e) => {
      sidebarDragging = true;
      sidebarResize.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    // Panel resize
    const panelResize = $('#panel-resize');
    let panelDragging = false;

    panelResize.addEventListener('mousedown', (e) => {
      panelDragging = true;
      panelResize.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (sidebarDragging) {
        const newWidth = e.clientX - dom.sidebar.getBoundingClientRect().left;
        if (newWidth >= 170 && newWidth <= 600) {
          dom.sidebar.style.width = newWidth + 'px';
        }
      }
      if (panelDragging) {
        const mainRect = $('#main-content').getBoundingClientRect();
        const newHeight = mainRect.bottom - e.clientY;
        if (newHeight >= 80 && newHeight <= mainRect.height - 100) {
          dom.panel.style.height = newHeight + 'px';
        }
        fitTerminal();
      }
    });

    document.addEventListener('mouseup', () => {
      if (sidebarDragging) {
        sidebarDragging = false;
        sidebarResize.classList.remove('dragging');
        document.body.style.cursor = '';
      }
      if (panelDragging) {
        panelDragging = false;
        panelResize.classList.remove('dragging');
        document.body.style.cursor = '';
        fitTerminal();
      }
    });
  }

  function fitTerminal() {
    if (termFitAddon) {
      try { termFitAddon.fit(); } catch (e) { /* ignore */ }
    }
  }

  // ─── Settings ────────────────────────────────────────────
  function initSettings() {
    $('#setting-font-size').addEventListener('change', (e) => {
      const size = parseInt(e.target.value);
      if (editor && size >= 10 && size <= 30) {
        editor.updateOptions({ fontSize: size });
      }
    });

    $('#setting-tab-size').addEventListener('change', (e) => {
      const size = parseInt(e.target.value);
      if (editor && size >= 2 && size <= 8) {
        editor.updateOptions({ tabSize: size });
      }
    });

    $('#setting-word-wrap').addEventListener('change', (e) => {
      if (editor) editor.updateOptions({ wordWrap: e.target.value });
    });

    $('#setting-minimap').addEventListener('change', (e) => {
      if (editor) editor.updateOptions({ minimap: { enabled: e.target.value === 'true' } });
    });
  }

  // ─── Package Installer ──────────────────────────────────
  function initPackageInstaller() {
    $('#btn-install-package').addEventListener('click', () => {
      const pkg = dom.packageInput.value.trim();
      if (pkg) {
        pyWorker.postMessage({ type: 'install', data: { package: pkg } });
        state.installedPackages.push(pkg);
        renderInstalledPackages();
        dom.packageInput.value = '';
        showNotification(`Installing ${pkg}...`, 'info');
      }
    });

    dom.packageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        $('#btn-install-package').click();
      }
    });
  }

  // ─── Notifications ──────────────────────────────────────
  function showNotification(message, type = 'info') {
    const icons = { info: 'codicon-info', success: 'codicon-check', error: 'codicon-error' };
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.innerHTML = `<span class="codicon ${icons[type]}"></span> ${escapeHtml(message)}`;
    document.body.appendChild(el);

    setTimeout(() => {
      el.classList.add('fadeout');
      setTimeout(() => el.remove(), 300);
    }, 2500);
  }

  // ─── Keyboard Shortcuts ──────────────────────────────────
  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;

      // Ctrl+S — Save
      if (mod && e.key === 's') {
        e.preventDefault();
        saveCurrentFile();
      }

      // Ctrl+` — Toggle terminal
      if (mod && e.key === '`') {
        e.preventDefault();
        dom.panel.classList.toggle('collapsed');
        fitTerminal();
      }

      // F5 — Run
      if (e.key === 'F5') {
        e.preventDefault();
        const file = state.activeTab || 'main.py';
        runPython(file);
      }

      // Ctrl+Shift+P — Command palette (stub)
      if (mod && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        showNotification('Command palette coming soon!', 'info');
      }

      // Ctrl+W — Close tab
      if (mod && e.key === 'w') {
        e.preventDefault();
        if (state.activeTab) closeTab(state.activeTab);
      }

      // Ctrl+B — Toggle sidebar
      if (mod && e.key === 'b') {
        e.preventDefault();
        dom.sidebar.classList.toggle('collapsed');
      }
    });
  }

  // ─── Button Handlers ─────────────────────────────────────
  function initButtons() {
    // New file / folder buttons
    $('#btn-new-file').addEventListener('click', () => promptNewFile(''));
    $('#btn-new-folder').addEventListener('click', () => promptNewFolder(''));

    // Run button
    $('#btn-run').addEventListener('click', () => {
      const file = state.activeTab || 'main.py';
      runPython(file);
    });

    // Clear terminal
    $('#btn-clear-terminal').addEventListener('click', () => {
      term.clear();
      termWritePrompt();
    });

    // Toggle panel
    $('#btn-toggle-panel').addEventListener('click', () => {
      dom.panel.classList.toggle('collapsed');
      fitTerminal();
    });

    // Welcome buttons
    $('#btn-welcome-open').addEventListener('click', () => {
      $$('.activity-btn').forEach(b => b.classList.remove('active'));
      $('[data-panel="explorer"]').classList.add('active');
      $$('.sidebar-panel').forEach(p => p.classList.remove('active'));
      $('#sidebar-explorer').classList.add('active');
      dom.sidebar.classList.remove('collapsed');
    });

    $('#btn-welcome-new').addEventListener('click', () => promptNewFile(''));

    $('#btn-welcome-clone').addEventListener('click', () => {
      const url = prompt('Enter a Git repository URL:', 'https://github.com/user/repo');
      if (url && url.trim()) {
        cloneRepo(url.trim());
      }
    });

    $('#btn-welcome-run').addEventListener('click', () => {
      runPython('main.py');
    });
  }

  // ─── Git UI Functions ─────────────────────────────────────
  function gitStatusToBadge(status) {
    const map = {
      'modified': { letter: 'M', cls: 'git-modified', treeClass: 'git-modified' },
      'staged': { letter: 'M', cls: 'git-modified', treeClass: 'git-modified' },
      'staged-modified': { letter: 'M', cls: 'git-modified', treeClass: 'git-modified' },
      'added': { letter: 'A', cls: 'git-added', treeClass: 'git-added' },
      'added-modified': { letter: 'A', cls: 'git-added', treeClass: 'git-added' },
      'deleted': { letter: 'D', cls: 'git-deleted', treeClass: 'git-deleted' },
      'deleted-staged': { letter: 'D', cls: 'git-deleted', treeClass: 'git-deleted' },
      'untracked': { letter: 'U', cls: 'git-untracked', treeClass: 'git-untracked' },
    };
    return map[status] || { letter: '?', cls: '', treeClass: '' };
  }

  async function refreshGitStatus() {
    if (!GitModule.isReady()) return;

    const statusList = await GitModule.status();
    state.gitStatusMap = {};
    for (const entry of statusList) {
      state.gitStatusMap[entry.filepath] = entry.status;
    }

    // Update badge
    const changeCount = statusList.length;
    if (changeCount > 0) {
      dom.gitBadge.textContent = changeCount;
      dom.gitBadge.classList.remove('hidden');
    } else {
      dom.gitBadge.classList.add('hidden');
    }

    // Update branch
    const branch = await GitModule.currentBranch();
    dom.statusBranchName.textContent = branch;

    // Render source control panel
    renderGitPanel(statusList);

    // Refresh file tree decorations
    renderFileTree();
  }

  function renderGitPanel(statusList) {
    // Separate staged and unstaged
    const staged = statusList.filter(s => ['staged', 'added', 'staged-modified', 'deleted-staged'].includes(s.status));
    const unstaged = statusList.filter(s => ['modified', 'deleted', 'untracked', 'added-modified'].includes(s.status));

    dom.stagedCount.textContent = staged.length;
    dom.changesCount.textContent = unstaged.length;

    // Render staged files
    dom.stagedList.innerHTML = '';
    for (const entry of staged) {
      dom.stagedList.appendChild(createGitFileItem(entry, true));
    }

    // Render unstaged files
    dom.changesList.innerHTML = '';
    for (const entry of unstaged) {
      dom.changesList.appendChild(createGitFileItem(entry, false));
    }

    // Render commit log
    renderGitLog();
  }

  function createGitFileItem(entry, isStaged) {
    const el = document.createElement('div');
    el.className = 'git-file-item';

    const badge = gitStatusToBadge(entry.status);
    const filename = entry.filepath.split('/').pop();

    el.innerHTML = `
      <span class="git-file-name" title="${entry.filepath}">${filename}</span>
      <span class="git-file-actions">
        ${isStaged
          ? `<button class="git-file-action" title="Unstage"><span class="codicon codicon-remove"></span></button>`
          : `<button class="git-file-action" title="Stage"><span class="codicon codicon-add"></span></button>`
        }
      </span>
      <span class="git-file-status status-${badge.letter}">${badge.letter}</span>
    `;

    // Click file to open diff
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.git-file-action')) return;
      await showDiffView(entry.filepath);
    });

    // Stage/unstage button
    const actionBtn = el.querySelector('.git-file-action');
    if (actionBtn) {
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isStaged) {
          await GitModule.unstage(entry.filepath);
        } else {
          await GitModule.syncVfsToGitFS(vfsGetAllFiles);
          await GitModule.add(entry.filepath);
        }
        await refreshGitStatus();
      });
    }

    return el;
  }

  async function renderGitLog() {
    if (!GitModule.isReady()) return;
    const commits = await GitModule.log(20);
    dom.gitLogList.innerHTML = '';
    for (const c of commits) {
      const el = document.createElement('div');
      el.className = 'git-log-item';
      el.innerHTML = `
        <div class="git-log-message">${escapeHtml(c.message.trim())}</div>
        <div class="git-log-meta">
          <span class="git-log-sha">${c.sha}</span>
          <span>${c.dateStr}</span>
        </div>
      `;
      dom.gitLogList.appendChild(el);
    }
  }

  async function showDiffView(filepath) {
    if (!state.monacoReady) return;
    const d = await GitModule.diff(filepath);

    // Create diff editor container if it doesn't exist
    let diffContainer = $('#diff-container');
    if (!diffContainer) {
      diffContainer = document.createElement('div');
      diffContainer.id = 'diff-container';
      $('#editor-area').appendChild(diffContainer);
    }

    // Show diff container
    diffContainer.classList.add('visible');
    dom.editorContainer.classList.remove('visible');
    dom.welcomeView.classList.add('hidden');
    state.showDiff = true;

    // Create or update diff editor
    if (diffEditor) {
      diffEditor.dispose();
    }

    const originalModel = monaco.editor.createModel(d.oldContent, getLanguageForPath(filepath));
    const modifiedModel = monaco.editor.createModel(d.newContent, getLanguageForPath(filepath));

    diffEditor = monaco.editor.createDiffEditor(diffContainer, {
      theme: 'pycode-dark',
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
      fontSize: 14,
      readOnly: true,
      automaticLayout: true,
      renderSideBySide: true,
      originalEditable: false,
    });

    diffEditor.setModel({ original: originalModel, modified: modifiedModel });

    // Update titlebar
    dom.titlebarFilename.textContent = `${filepath} (diff)`;

    // Add a diff tab
    const diffTabPath = `__diff__${filepath}`;
    if (!state.openTabs.find(t => t.path === diffTabPath)) {
      state.openTabs.push({ path: diffTabPath, dirty: false });
    }
    state.activeTab = diffTabPath;
    renderTabs();
  }

  function closeDiffView() {
    const diffContainer = $('#diff-container');
    if (diffContainer) {
      diffContainer.classList.remove('visible');
    }
    if (diffEditor) {
      diffEditor.dispose();
      diffEditor = null;
    }
    state.showDiff = false;
  }

  // Override closeTab to handle diff tabs
  const originalCloseTab = closeTab;
  closeTab = function(path) {
    if (path.startsWith('__diff__')) {
      const idx = state.openTabs.findIndex(t => t.path === path);
      if (idx !== -1) state.openTabs.splice(idx, 1);
      closeDiffView();
      if (state.openTabs.length > 0) {
        const newActive = state.openTabs[Math.min(idx, state.openTabs.length - 1)].path;
        state.activeTab = newActive;
        if (!newActive.startsWith('__diff__')) {
          switchEditorToTab(newActive);
        }
      } else {
        state.activeTab = null;
      }
      renderTabs();
      updateWelcomeView();
      return;
    }
    originalCloseTab(path);
  };

  // Override switchEditorToTab to close diff when switching to a normal tab
  const originalSwitchEditorToTab = switchEditorToTab;
  switchEditorToTab = function(path) {
    if (state.showDiff) {
      closeDiffView();
    }
    originalSwitchEditorToTab(path);
  };

  // Override renderTabs to handle diff tab labels
  const originalRenderTabs = renderTabs;
  renderTabs = function() {
    const container = dom.tabsContainer;
    container.innerHTML = '';

    for (const tab of state.openTabs) {
      const el = document.createElement('div');
      const isDiff = tab.path.startsWith('__diff__');
      const displayName = isDiff ? tab.path.replace('__diff__', '') + ' ↔' : tab.path.split('/').pop();

      el.className = 'tab' + (tab.path === state.activeTab ? ' active' : '') + (tab.dirty ? ' dirty' : '');

      const iconClass = isDiff ? 'codicon-diff' : getFileIconClass(tab.path);
      el.innerHTML = `
        <span class="tab-icon codicon ${iconClass}"></span>
        <span class="tab-label">${displayName}</span>
        <span class="tab-dirty"></span>
        <span class="tab-close codicon codicon-close" data-path="${tab.path}"></span>
      `;

      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) {
          closeTab(e.target.dataset.path);
        } else {
          state.activeTab = tab.path;
          if (isDiff) {
            // Re-show diff
            const filepath = tab.path.replace('__diff__', '');
            showDiffView(filepath);
          } else {
            renderTabs();
            switchEditorToTab(tab.path);
          }
        }
      });

      el.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          closeTab(tab.path);
        }
      });

      container.appendChild(el);
    }
  };

  async function doGitCommit() {
    const msg = dom.gitCommitMsg.value.trim();
    if (!msg) {
      showNotification('Please enter a commit message', 'info');
      return;
    }
    try {
      const sha = await GitModule.commit(msg);
      if (sha) {
        const branch = await GitModule.currentBranch();
        showNotification(`Committed: [${branch} ${sha.slice(0, 7)}]`, 'success');
        dom.gitCommitMsg.value = '';
        await refreshGitStatus();
      }
    } catch (err) {
      showNotification('Commit failed: ' + err.message, 'error');
    }
  }

  async function doGitStageAll() {
    try {
      await GitModule.addAll(vfsGetAllFiles);
      await refreshGitStatus();
      showNotification('All changes staged', 'success');
    } catch (err) {
      showNotification('Stage failed: ' + err.message, 'error');
    }
  }

  function initGitButtons() {
    $('#btn-git-commit').addEventListener('click', doGitCommit);
    dom.gitCommitMsg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doGitCommit();
    });
    $('#btn-git-add-all').addEventListener('click', doGitStageAll);
    $('#btn-git-refresh').addEventListener('click', async () => {
      await GitModule.syncVfsToGitFS(vfsGetAllFiles);
      await refreshGitStatus();
    });

    // Branch click in status bar
    $('#status-branch').addEventListener('click', async () => {
      const branches = await GitModule.listBranches();
      const current = await GitModule.currentBranch();
      const choice = prompt(`Switch branch (current: ${current}):\n\nAvailable: ${branches.join(', ')}\n\nType branch name or new-branch-name:`);
      if (!choice) return;
      try {
        if (!branches.includes(choice)) {
          await GitModule.createBranch(choice);
        }
        await GitModule.checkout(choice);
        await GitModule.syncGitFSToVfs(vfsSet, () => vfs.clear());
        renderFileTree();
        syncFSToWorker();
        await refreshGitStatus();
        showNotification(`Switched to branch: ${choice}`, 'success');
      } catch (err) {
        showNotification('Branch switch failed: ' + err.message, 'error');
      }
    });
  }

  // ─── Window Resize ───────────────────────────────────────
  window.addEventListener('resize', () => {
    fitTerminal();
  });

  // ─── Initialize ──────────────────────────────────────────
  async function init() {
    // Initialize virtual filesystem
    vfsInit();

    // Render file tree
    renderFileTree();

    // Initialize terminal
    initTerminal();

    // Initialize sidebar panels
    initSidebarPanels();

    // Initialize resize handles
    initResizeHandles();

    // Initialize search
    initSearch();

    // Initialize settings
    initSettings();

    // Initialize package installer
    initPackageInstaller();

    // Initialize keyboard shortcuts
    initKeyboard();

    // Initialize button handlers
    initButtons();

    // Initialize Git buttons
    initGitButtons();

    // Load Monaco Editor
    await loadMonaco();

    // Initialize Pyodide worker
    initPyodideWorker();

    // Check for ?repo= URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const repoUrl = urlParams.get('repo');

    if (repoUrl) {
      // Clone from URL param — skip default VFS init git
      termWrite('\x1b[36mRepository URL detected, cloning...\x1b[0m\r\n');
      // Give Monaco and terminal a moment to render, then clone
      setTimeout(() => cloneRepo(repoUrl), 300);
    } else {
      // Normal init — set up git with existing VFS files
      const gitOk = await GitModule.init(vfsGetAllFiles);
      if (gitOk) {
        await refreshGitStatus();
        termWrite('\x1b[32m✓ Git initialized\x1b[0m\r\n');
      }
    }

    // Update welcome view
    updateWelcomeView();

    // Fit terminal after everything is loaded
    setTimeout(fitTerminal, 500);
  }

  // Start the app
  init();
})();
