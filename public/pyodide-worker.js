/* ============================================================
   Pyodide Web Worker
   Runs Python code in an isolated thread so the UI never freezes.
   Communicates with the main thread via postMessage.
   ============================================================ */

let pyodide = null;
let isReady = false;

// Virtual filesystem contents passed from main thread
let virtualFS = {};

// When non-null, stdout/stderr route to cell-specific messages
let activeCellId = null;

async function initPyodide() {
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js');
  
  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/',
    stdout: (text) => {
      if (activeCellId) {
        self.postMessage({ type: 'cell-stdout', cellId: activeCellId, data: text });
      } else {
        self.postMessage({ type: 'stdout', data: text });
      }
    },
    stderr: (text) => {
      if (activeCellId) {
        self.postMessage({ type: 'cell-stderr', cellId: activeCellId, data: text });
      } else {
        self.postMessage({ type: 'stderr', data: text });
      }
    }
  });

  // Install micropip for package management
  await pyodide.loadPackage('micropip');

  // ── Matplotlib custom backend ───────────────────────────
  // Register a JS callback that the Python backend will call with base64 image data
  self._sendPlotImage = (dataUri) => {
    if (activeCellId) {
      self.postMessage({ type: 'cell-image', cellId: activeCellId, data: dataUri });
    } else {
      self.postMessage({ type: 'image', data: dataUri });
    }
  };

  // Write a custom matplotlib backend into Pyodide's filesystem.
  // This is the proper way to intercept plt.show() — matplotlib calls
  // the backend's show() natively, no import hooks needed.
  await pyodide.runPythonAsync(`
import os, sys
os.environ['MPLBACKEND'] = 'module://pycode_backend'
if '/' not in sys.path:
    sys.path.insert(0, '/')
`);

  pyodide.FS.writeFile('/pycode_backend.py', `
"""
PyCode custom matplotlib backend for Web Worker rendering.
Extends the Agg backend, captures figures as PNG, and sends them
to the main thread as base64 data URIs via postMessage.
"""
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.backend_bases import FigureManagerBase
import matplotlib

# Required by matplotlib backend protocol
FigureCanvas = FigureCanvasAgg

class FigureManager(FigureManagerBase):
    def show(self):
        import base64, io
        from js import self as _js_self
        fig = self.canvas.figure
        buf = io.BytesIO()
        fc = fig.get_facecolor()
        bg = fc if fc != (1.0, 1.0, 1.0, 0.0) else '#1e1e1e'
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                    facecolor=bg, edgecolor='none')
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode('ascii')
        _js_self._sendPlotImage(f'data:image/png;base64,{b64}')
        buf.close()

def show(*args, **kwargs):
    """Called by plt.show() — iterates all figures, renders, and cleans up."""
    from matplotlib._pylab_helpers import Gcf
    for manager in Gcf.get_all_fig_managers():
        manager.show()
    Gcf.destroy_all()

def new_figure_manager(num, *args, FigureClass=None, **kwargs):
    from matplotlib.figure import Figure
    if FigureClass is None:
        FigureClass = Figure
    fig = FigureClass(*args, **kwargs)
    canvas = FigureCanvas(fig)
    manager = FigureManager(canvas, num)
    return manager

def new_figure_manager_given_figure(num, figure):
    canvas = FigureCanvas(figure)
    manager = FigureManager(canvas, num)
    return manager
`);

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

    case 'syncFS':
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
        const filename = data.filename || 'main.py';
        
        // Determine parent directory of the file
        const parts = filename.split('/');
        const parentDir = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';
        
        // Gather all top-level directories for sys.path (so cross-package imports work)
        let topDirs = [];
        try {
          topDirs = pyodide.FS.readdir('/').filter(d => d !== '.' && d !== '..' && d !== '.git');
          topDirs = topDirs.filter(d => {
            try { return pyodide.FS.isDir(pyodide.FS.stat('/' + d).mode); } catch { return false; }
          }).map(d => '/' + d);
        } catch (e) { /* ignore */ }
        
        await pyodide.runPythonAsync(`
import sys, os
sys.argv = ['${filename}']
for p in ['/', '', '${parentDir}', ${topDirs.map(d => `'${d}'`).join(', ')}]:
    if p not in sys.path:
        sys.path.insert(0, p)
os.chdir('${parentDir}')
`);
        
        // Read and run the file
        const code = pyodide.FS.readFile('/' + filename, { encoding: 'utf8' });
        await pyodide.runPythonAsync(code);
        self.postMessage({ type: 'done', success: true });
      } catch (err) {
        self.postMessage({ type: 'stderr', data: err.message });
        self.postMessage({ type: 'done', success: false });
      }
      break;

    case 'exec':
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

    case 'execCell': {
      if (!isReady) {
        self.postMessage({ type: 'cell-stderr', cellId: data.cellId, data: 'Python is still loading...' });
        return;
      }
      const cellId = data.cellId;
      activeCellId = cellId;
      
      try {
        syncVirtualFS();
        const result = await pyodide.runPythonAsync(data.code);
        if (result !== undefined && result !== null) {
          self.postMessage({ type: 'cell-stdout', cellId, data: String(result) });
        }
        self.postMessage({ type: 'cell-done', cellId, success: true });
      } catch (err) {
        self.postMessage({ type: 'cell-stderr', cellId, data: err.message });
        self.postMessage({ type: 'cell-done', cellId, success: false });
      }
      
      activeCellId = null;
      break;
    }

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

    case 'listPackages':
      if (!isReady) return;
      try {
        const micropip = pyodide.pyimport('micropip');
        const pkgs = micropip.list();
        self.postMessage({ type: 'packages', data: pkgs.toJs() });
      } catch (err) {
        self.postMessage({ type: 'stderr', data: err.message });
      }
      break;

    case 'configurePaths':
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
      } catch (err) {
        self.postMessage({ type: 'stderr', data: 'Failed to configure paths: ' + err.message });
      }
      break;

    case 'runEntrypoint':
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
