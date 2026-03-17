/**
 * Web Server Service — registers the Service Worker and bridges
 * HTTP requests between the SW and the Pyodide WSGI worker.
 *
 * Uses BroadcastChannel for reliable messaging between contexts.
 */

import { postToWorker } from './pyodide';

let swRegistered = false;
let serverRunning = false;

// BroadcastChannel for SW ↔ main thread communication
const channel = new BroadcastChannel('pycode-http');

// ── Pending request tracking ────────────────────────────

const pendingRequests = new Map<number, true>();

/**
 * Register the PyCode Service Worker and set up the HTTP bridge.
 */
export async function registerServiceWorker(): Promise<boolean> {
  if (swRegistered) return true;
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers not supported');
    return false;
  }

  try {
    await navigator.serviceWorker.register('/pycode-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // Listen for HTTP requests from the SW via BroadcastChannel
    channel.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== 'http-request') return;

      const { reqId, method, path, queryString, headers, body } = event.data;
      pendingRequests.set(reqId, true);

      // Forward to Pyodide worker
      postToWorker('http-request', { reqId, method, path, queryString, headers, body });
    };

    swRegistered = true;
    console.log('PyCode Service Worker registered');
    return true;
  } catch (err) {
    console.error('Failed to register Service Worker:', err);
    return false;
  }
}

/**
 * Called when the Pyodide worker sends back an HTTP response.
 * Forwards it to the SW via BroadcastChannel.
 */
export function handleHttpResponse(data: {
  reqId: number;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}): void {
  if (!pendingRequests.has(data.reqId)) return;
  pendingRequests.delete(data.reqId);

  // Send response back to SW via BroadcastChannel
  channel.postMessage({
    type: 'http-response',
    reqId: data.reqId,
    status: data.status,
    statusText: data.statusText,
    headers: data.headers,
    body: data.body,
  });
}

/**
 * Start the WSGI server with the given Flask app module.
 */
export function startServer(filename: string): void {
  postToWorker('start-server', { filename });
  serverRunning = true;
}

/**
 * Stop the WSGI server.
 */
export function stopServer(): void {
  postToWorker('stop-server');
  serverRunning = false;
}

/**
 * Whether the virtual web server is currently running.
 */
export function isServerRunning(): boolean {
  return serverRunning;
}
