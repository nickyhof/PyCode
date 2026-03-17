/* ============================================================
   PyCode Service Worker — Virtual Web Server
   Intercepts fetch requests under /pycode-server/ and routes
   them to the Python WSGI app running in the Pyodide worker.

   Uses BroadcastChannel for reliable messaging (MessageChannel
   port transfers between SW and clients are unreliable).
   ============================================================ */

const SCOPE_PREFIX = '/pycode-server/';
const channel = new BroadcastChannel('pycode-http');
let reqCounter = 0;

// Map of pending requests waiting for responses
const pending = new Map();

// Listen for HTTP responses from the main thread
channel.onmessage = (event) => {
  if (event.data?.type !== 'http-response') return;
  const { reqId } = event.data;
  const resolver = pending.get(reqId);
  if (resolver) {
    pending.delete(reqId);
    resolver(event.data);
  }
};

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(SCOPE_PREFIX)) return;
  event.respondWith(handleRequest(event.request, url));
});

async function handleRequest(request, url) {
  try {
    const appPath = '/' + url.pathname.slice(SCOPE_PREFIX.length);
    const queryString = url.search ? url.search.slice(1) : '';

    let body = '';
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try { body = await request.text(); } catch { body = ''; }
    }

    const headers = {};
    request.headers.forEach((v, k) => { headers[k] = v; });

    const reqId = reqCounter++;

    // Send request to main thread via BroadcastChannel
    const responsePromise = new Promise((resolve) => {
      pending.set(reqId, resolve);
      // Timeout after 30 seconds
      setTimeout(() => {
        if (pending.has(reqId)) {
          pending.delete(reqId);
          resolve({ status: 504, statusText: 'Gateway Timeout', headers: {}, body: 'Request timed out' });
        }
      }, 30000);
    });

    channel.postMessage({
      type: 'http-request',
      reqId,
      method: request.method,
      path: appPath,
      queryString,
      headers,
      body,
    });

    const res = await responsePromise;
    return new Response(res.body, {
      status: res.status || 200,
      statusText: res.statusText || 'OK',
      headers: new Headers(res.headers || {}),
    });
  } catch (err) {
    return new Response('Server Error: ' + err.message, { status: 500 });
  }
}
