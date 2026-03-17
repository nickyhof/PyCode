/**
 * Share URL Service — encode/decode code into/from URL hash fragments.
 * Uses native CompressionStream/DecompressionStream (gzip) for compact URLs.
 */

export interface SharedCode {
  filename: string;
  code: string;
}

/**
 * Compress a string with gzip and return a base64url-encoded string.
 */
async function compress(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const stream = new Blob([encoder.encode(input)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const compressed = await new Response(stream).arrayBuffer();
  // Convert to base64url (URL-safe base64)
  let b64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));
  b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64;
}

/**
 * Decompress a base64url-encoded gzip string.
 */
async function decompress(b64url: string): Promise<string> {
  // Restore standard base64
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const decompressed = await new Response(stream).text();
  return decompressed;
}

/**
 * Generate a shareable URL for the given file.
 */
export async function encodeShareUrl(filename: string, code: string): Promise<string> {
  const compressed = await compress(code);
  const encodedName = encodeURIComponent(filename);
  const url = new URL(window.location.href);
  url.hash = `code=${compressed}&file=${encodedName}`;
  return url.toString();
}

/**
 * Check the current URL for shared code. Returns null if not a share link.
 */
export async function decodeShareUrl(): Promise<SharedCode | null> {
  const hash = window.location.hash.slice(1); // remove '#'
  if (!hash || !hash.startsWith('code=')) return null;

  try {
    const params = new URLSearchParams(hash);
    const compressed = params.get('code');
    const filename = params.get('file') || 'shared.py';
    if (!compressed) return null;

    const code = await decompress(compressed);
    return { filename: decodeURIComponent(filename), code };
  } catch (err) {
    console.error('Failed to decode share URL:', err);
    return null;
  }
}

/**
 * Clear the share hash from the URL without reloading.
 */
export function clearShareHash(): void {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
