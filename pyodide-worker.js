/* ============================================================
   Pyodide Web Worker
   Runs Python code in an isolated thread so the UI never freezes.
   Communicates with the main thread via postMessage.
   ============================================================ */

let pyodide = null;
let isReady = false;

// Virtual filesystem contents passed from main thread
let virtualFS = {};

async function initPyodide() {
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js');
  
  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/',
    stdout: (text) => {
      self.postMessage({ type: 'stdout', data: text });
    },
    stderr: (text) => {
      self.postMessage({ type: 'stderr', data: text });
    }
  });

  // Install micropip for package management
  await pyodide.loadPackage('micropip');

  isReady = true;
  self.postMessage({ type: 'ready' });
}

function syncVirtualFS() {
  // Write all virtual files into Pyodide's in-memory filesystem
  for (const [path, content] of Object.entries(virtualFS)) {
    try {
      // Ensure parent directories exist
      const parts = path.split('/').filter(Boolean);
      let dir = '';
      for (let i = 0; i < parts.length - 1; i++) {
        dir += '/' + parts[i];
        try { pyodide.FS.mkdir(dir); } catch (e) { /* exists */ }
      }
      pyodide.FS.writeFile('/' + path, content);
    } catch (e) {
      // ignore write errors for directories
    }
  }
}

self.onmessage = async function(e) {
  const { type, data } = e.data;

  switch (type) {
    case 'init':
      try {
        await initPyodide();
      } catch (err) {
        self.postMessage({ type: 'stderr', data: 'Failed to load Pyodide: ' + err.message });
      }
      break;

    case 'updateFS':
      virtualFS = data;
      if (isReady) syncVirtualFS();
      break;

    case 'run':
      if (!isReady) {
        self.postMessage({ type: 'stderr', data: 'Python is still loading...' });
        return;
      }
      
      // Sync filesystem before each run
      syncVirtualFS();

      // Change to root so imports work
      pyodide.FS.chdir('/');

      try {
        // Set up sys.argv and ensure root is in sys.path for imports
        const filename = data.filename || 'main.py';
        await pyodide.runPythonAsync(`
import sys
sys.argv = ['${filename}']
if '/' not in sys.path:
    sys.path.insert(0, '/')
if '' not in sys.path:
    sys.path.insert(0, '')
`);
        
        // Run the code
        await pyodide.runPythonAsync(data.code);
        self.postMessage({ type: 'done', success: true });
      } catch (err) {
        self.postMessage({ type: 'stderr', data: err.message });
        self.postMessage({ type: 'done', success: false });
      }
      break;

    case 'install':
      if (!isReady) {
        self.postMessage({ type: 'stderr', data: 'Python is still loading...' });
        return;
      }
      try {
        const micropip = pyodide.pyimport('micropip');
        self.postMessage({ type: 'stdout', data: `Installing ${data.package}...` });
        await micropip.install(data.package);
        self.postMessage({ type: 'stdout', data: `Successfully installed ${data.package}` });
      } catch (err) {
        self.postMessage({ type: 'stderr', data: `Failed to install ${data.package}: ${err.message}` });
      }
      break;

    case 'repl':
      if (!isReady) {
        self.postMessage({ type: 'stderr', data: 'Python is still loading...' });
        return;
      }
      try {
        const result = await pyodide.runPythonAsync(data.code);
        if (result !== undefined && result !== null) {
          self.postMessage({ type: 'stdout', data: String(result) });
        }
        self.postMessage({ type: 'repl-done', success: true });
      } catch (err) {
        self.postMessage({ type: 'stderr', data: err.message });
        self.postMessage({ type: 'repl-done', success: false });
      }
      break;

    case 'configurePaths':
      // Add directories to sys.path for workspace imports
      if (!isReady) return;
      try {
        const paths = data.paths || [];
        const pathsJson = JSON.stringify(paths);
        await pyodide.runPythonAsync(`
import sys, json
_new_paths = json.loads('${pathsJson}')
for _p in _new_paths:
    if _p not in sys.path:
        sys.path.insert(0, _p)
`);
        self.postMessage({ type: 'stdout', data: `Configured ${paths.length} workspace path(s)` });
        self.postMessage({ type: 'paths-done', success: true });
      } catch (err) {
        self.postMessage({ type: 'stderr', data: 'Failed to configure paths: ' + err.message });
        self.postMessage({ type: 'paths-done', success: false });
      }
      break;

    case 'runEntrypoint':
      // Run a module:function entrypoint (e.g. "myapp:main")
      if (!isReady) {
        self.postMessage({ type: 'stderr', data: 'Python is still loading...' });
        return;
      }
      syncVirtualFS();
      pyodide.FS.chdir('/');
      try {
        const entry = data.entrypoint; // "myapp:main"
        const [mod, func] = entry.split(':');
        await pyodide.runPythonAsync(`
import sys
if '/' not in sys.path:
    sys.path.insert(0, '/')
if '' not in sys.path:
    sys.path.insert(0, '')
from ${mod} import ${func}
${func}()
`);
        self.postMessage({ type: 'done', success: true });
      } catch (err) {
        self.postMessage({ type: 'stderr', data: err.message });
        self.postMessage({ type: 'done', success: false });
      }
      break;
  }
};
