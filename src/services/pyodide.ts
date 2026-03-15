/**
 * Pyodide Worker Communication — manages the web worker that runs Python.
 */

export type PyodideMessageHandler = (type: string, data: unknown) => void;

let worker: Worker | null = null;
let onMessage: PyodideMessageHandler | null = null;

/**
 * Initialize the Pyodide web worker.
 */
export function initPyodideWorker(messageHandler: PyodideMessageHandler): void {
  worker = new Worker(new URL('../../public/pyodide-worker.js', import.meta.url));
  onMessage = messageHandler;

  worker.onmessage = (e: MessageEvent) => {
    const { type, data } = e.data;
    if (onMessage) onMessage(type, data);
  };
}

/**
 * Send a message to the Pyodide worker.
 */
export function postToWorker(type: string, data?: unknown): void {
  if (!worker) return;
  worker.postMessage({ type, data });
}

/**
 * Sync all VFS files to the Pyodide worker's virtual filesystem.
 */
export function syncFilesToWorker(files: Record<string, string>): void {
  postToWorker('syncFS', files);
}

/**
 * Run a Python file via the worker.
 */
export function runPythonFile(filename: string): void {
  postToWorker('run', { filename });
}

/**
 * Execute raw Python code.
 */
export function runPythonCode(code: string): void {
  postToWorker('exec', { code });
}

/**
 * Install a Python package via micropip.
 */
export function installPackage(packageName: string): void {
  postToWorker('install', { package: packageName });
}

/**
 * Request the list of installed packages.
 */
export function listInstalledPackages(): void {
  postToWorker('listPackages');
}

/**
 * Send stdin input to the worker.
 */
export function sendStdin(text: string): void {
  postToWorker('stdin', { text });
}

/**
 * Terminate the worker.
 */
export function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
