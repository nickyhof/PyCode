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

// ── Stdin input support via SharedArrayBuffer ────────────────
// Layout: Int32[0] = flag (0=waiting, 1=ready), then Uint8 chars from offset 4
let inputBuffer = null;    // SharedArrayBuffer
let inputInt32 = null;     // Int32Array view for Atomics
let inputUint8 = null;     // Uint8Array view for text data

try {
  inputBuffer = new SharedArrayBuffer(4096); // 4 bytes flag + 4092 bytes text
  inputInt32 = new Int32Array(inputBuffer);
  inputUint8 = new Uint8Array(inputBuffer);
} catch {
  // SharedArrayBuffer not available (missing COOP/COEP headers)
  // Input will fall back to empty string
}

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

  // Write stub modules for packages unavailable in Pyodide (browser)
  // ssl — needed by FastAPI/httptools/email
  pyodide.FS.writeFile('/ssl.py', `
# Stub ssl module for Pyodide (browsers handle SSL natively)
import sys

PROTOCOL_TLS = 2
PROTOCOL_TLS_CLIENT = 16
PROTOCOL_TLS_SERVER = 17
PROTOCOL_SSLv23 = PROTOCOL_TLS
OP_NO_SSLv2 = 0x01000000
OP_NO_SSLv3 = 0x02000000
HAS_SNI = True
CERT_NONE = 0
CERT_OPTIONAL = 1
CERT_REQUIRED = 2
_RESTRICTED_SERVER_CIPHERS = ''

class SSLError(OSError): pass
class SSLZeroReturnError(SSLError): pass
class SSLWantReadError(SSLError): pass
class SSLWantWriteError(SSLError): pass
class SSLSyscallError(SSLError): pass
class SSLEOFError(SSLError): pass
class CertificateError(SSLError): pass

class SSLContext:
    def __init__(self, protocol=PROTOCOL_TLS, *args, **kwargs):
        self.protocol = protocol
        self.verify_mode = CERT_NONE
        self.check_hostname = False
    def set_default_verify_paths(self): pass
    def load_default_certs(self, purpose=None): pass
    def load_cert_chain(self, *a, **kw): pass
    def set_ciphers(self, s): pass
    def wrap_socket(self, sock, **kw): return sock

def create_default_context(*a, **kw):
    return SSLContext(PROTOCOL_TLS_CLIENT)

_create_default_https_context = create_default_context
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

  // ── Stdin input() support ─────────────────────────────────
  // JS function that blocks the worker until main thread provides input
  self._pycode_read_input = function(promptText) {
    if (!inputBuffer) {
      // No SharedArrayBuffer — return empty string
      return '';
    }
    // Reset the flag
    Atomics.store(inputInt32, 0, 0);
    // Ask the main thread for input
    self.postMessage({ type: 'input-request', data: promptText || '', buffer: inputBuffer, cellId: activeCellId });
    // Block until flag becomes 1 (main thread wrote input and notified)
    Atomics.wait(inputInt32, 0, 0);
    // Read the length from int32[1]
    const len = inputInt32[1];
    // Read the text bytes from offset 8
    const bytes = inputUint8.slice(8, 8 + len);
    return new TextDecoder().decode(bytes);
  };

  // Monkey-patch Python's input() to use our JS bridge
  await pyodide.runPythonAsync(`
import builtins
from js import self as _js_self

def _pycode_input(prompt=''):
    return _js_self._pycode_read_input(prompt or '')

builtins.input = _pycode_input
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

    case 'start-server':
      if (!isReady) {
        self.postMessage({ type: 'stderr', data: 'Python is still loading...' });
        return;
      }
      syncVirtualFS();
      pyodide.FS.chdir('/');
      try {
        const filename = data.filename;
        // Determine parent directory
        const parts = filename.split('/');
        const parentDir = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';

        await pyodide.runPythonAsync(`
import sys, os
for p in ['/', '', '${parentDir}']:
    if p not in sys.path:
        sys.path.insert(0, p)
os.chdir('${parentDir}')
`);

        // Read and execute the Flask app file to define the app
        const code = pyodide.FS.readFile('/' + filename, { encoding: 'utf8' });
        await pyodide.runPythonAsync(code);

        // Install the WSGI/ASGI adapter
        await pyodide.runPythonAsync(`
import io, sys, json, asyncio

async def _pycode_http_handler(method, path, query_string, headers, body):
    """Handle an HTTP request via WSGI (Flask) or ASGI (FastAPI)."""
    # Find a web framework app in globals
    _wsgi_app = None
    _asgi_app = None

    for _name, _obj in dict(globals()).items():
        if isinstance(_obj, type):
            continue
        # Flask detection (WSGI)
        if hasattr(_obj, 'wsgi_app') and hasattr(_obj, 'route'):
            _wsgi_app = _obj
            break
        # FastAPI/Starlette detection (ASGI)
        if hasattr(_obj, 'router') and hasattr(_obj, 'add_api_route'):
            _asgi_app = _obj
            break

    if _wsgi_app is not None:
        return _handle_wsgi(_wsgi_app, method, path, query_string, headers, body)
    elif _asgi_app is not None:
        return await _handle_asgi(_asgi_app, method, path, query_string, headers, body)
    else:
        return json.dumps({
            'status': 500,
            'statusText': 'Internal Server Error',
            'headers': {'Content-Type': 'text/plain'},
            'body': 'No Flask or FastAPI app found. Define an app variable in your script.'
        })


def _handle_wsgi(app, method, path, query_string, headers, body):
    """Call a WSGI app (Flask)."""
    environ = {
        'REQUEST_METHOD': method,
        'PATH_INFO': path,
        'QUERY_STRING': query_string or '',
        'SERVER_NAME': 'localhost',
        'SERVER_PORT': '8000',
        'SERVER_PROTOCOL': 'HTTP/1.1',
        'HTTP_HOST': 'localhost:8000',
        'wsgi.version': (1, 0),
        'wsgi.url_scheme': 'http',
        'wsgi.input': io.BytesIO(body.encode('utf-8') if body else b''),
        'wsgi.errors': sys.stderr,
        'wsgi.multithread': False,
        'wsgi.multiprocess': False,
        'wsgi.run_once': False,
        'CONTENT_LENGTH': str(len(body.encode('utf-8') if body else b'')),
    }

    if headers:
        for key, value in headers.items():
            key_upper = key.upper().replace('-', '_')
            if key_upper == 'CONTENT_TYPE':
                environ['CONTENT_TYPE'] = value
            else:
                environ['HTTP_' + key_upper] = value

    _status = ['200 OK']
    _response_headers = [{}]

    def start_response(status, response_headers, exc_info=None):
        _status[0] = status
        _response_headers[0] = dict(response_headers)

    try:
        result = app.wsgi_app(environ, start_response)
        response_body = b''.join(result)
        if hasattr(result, 'close'):
            result.close()

        status_code = int(_status[0].split(' ', 1)[0])
        status_text = _status[0].split(' ', 1)[1] if ' ' in _status[0] else 'OK'

        return json.dumps({
            'status': status_code,
            'statusText': status_text,
            'headers': _response_headers[0],
            'body': response_body.decode('utf-8', errors='replace'),
        })
    except Exception as e:
        return json.dumps({
            'status': 500,
            'statusText': 'Internal Server Error',
            'headers': {'Content-Type': 'text/plain'},
            'body': f'WSGI Error: {str(e)}',
        })


async def _handle_asgi(app, method, path, query_string, headers, body):
    """Call an ASGI app (FastAPI/Starlette)."""
    scope = {
        'type': 'http',
        'asgi': {'version': '3.0'},
        'http_version': '1.1',
        'method': method,
        'path': path,
        'query_string': (query_string or '').encode('utf-8'),
        'root_path': '',
        'scheme': 'http',
        'server': ('localhost', 8000),
        'headers': [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
    }

    body_bytes = body.encode('utf-8') if body else b''
    response_started = False
    status_code = 200
    response_headers = {}
    response_body = b''

    async def receive():
        return {'type': 'http.request', 'body': body_bytes, 'more_body': False}

    async def send(message):
        nonlocal response_started, status_code, response_headers, response_body
        if message['type'] == 'http.response.start':
            response_started = True
            status_code = message.get('status', 200)
            raw_headers = message.get('headers', [])
            response_headers = {}
            for h in raw_headers:
                name = h[0].decode('utf-8') if isinstance(h[0], bytes) else h[0]
                val = h[1].decode('utf-8') if isinstance(h[1], bytes) else h[1]
                response_headers[name] = val
        elif message['type'] == 'http.response.body':
            response_body += message.get('body', b'')

    try:
        await app(scope, receive, send)
        return json.dumps({
            'status': status_code,
            'statusText': 'OK',
            'headers': response_headers,
            'body': response_body.decode('utf-8', errors='replace'),
        })
    except Exception as e:
        return json.dumps({
            'status': 500,
            'statusText': 'Internal Server Error',
            'headers': {'Content-Type': 'text/plain'},
            'body': f'ASGI Error: {str(e)}',
        })
`);

        self.postMessage({ type: 'stdout', data: '🚀 Server started! Preview at /pycode-server/' });
        self.postMessage({ type: 'server-started' });
        self.postMessage({ type: 'done', success: true });
      } catch (err) {
        self.postMessage({ type: 'stderr', data: 'Failed to start server: ' + err.message });
        self.postMessage({ type: 'done', success: false });
      }
      break;

    case 'stop-server':
      try {
        await pyodide.runPythonAsync(`
try:
    del _pycode_http_handler
    del _handle_wsgi
    del _handle_asgi
except NameError:
    pass
`);
        self.postMessage({ type: 'stdout', data: '⏹️ Server stopped.' });
        self.postMessage({ type: 'server-stopped' });
      } catch (err) {
        self.postMessage({ type: 'stderr', data: err.message });
      }
      break;

    case 'http-request': {
      if (!isReady) {
        self.postMessage({
          type: 'http-response',
          data: { reqId: data.reqId, status: 503, statusText: 'Unavailable', headers: {}, body: 'Python not ready' }
        });
        return;
      }
      try {
        const { reqId, method, path, queryString, headers, body } = data;

        // Pass data via Pyodide globals to avoid string escaping issues
        pyodide.globals.set('_req_method', method);
        pyodide.globals.set('_req_path', path);
        pyodide.globals.set('_req_qs', queryString || '');
        pyodide.globals.set('_req_headers', pyodide.toPy(headers || {}));
        pyodide.globals.set('_req_body', body || '');

        const resultJson = await pyodide.runPythonAsync(`
await _pycode_http_handler(_req_method, _req_path, _req_qs, dict(_req_headers), _req_body)
`);

        const result = JSON.parse(resultJson);
        self.postMessage({
          type: 'http-response',
          data: { reqId, ...result }
        });
      } catch (err) {
        self.postMessage({
          type: 'http-response',
          data: {
            reqId: data.reqId,
            status: 500,
            statusText: 'Internal Server Error',
            headers: { 'Content-Type': 'text/plain' },
            body: 'Worker Error: ' + err.message,
          }
        });
      }
      break;
    }
  }
};
