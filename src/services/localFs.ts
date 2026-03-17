/**
 * Local File System Access — wraps the File System Access API
 * to open local directories and read/write files.
 */

/** Directories to skip when recursively reading */
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.venv', 'venv',
  '.mypy_cache', '.pytest_cache', '.tox', 'dist', 'build',
  '.eggs', '*.egg-info', '.DS_Store',
]);

/** File extensions we consider text-editable */
const TEXT_EXTENSIONS = new Set([
  'py', 'pyi', 'pyw', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx',
  'json', 'md', 'txt', 'html', 'htm', 'css', 'scss', 'less',
  'xml', 'yaml', 'yml', 'toml', 'cfg', 'ini', 'env',
  'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd', 'ps1',
  'sql', 'graphql', 'gql', 'csv', 'tsv',
  'rst', 'tex', 'log', 'gitignore', 'dockerignore',
  'editorconfig', 'prettierrc', 'eslintrc',
  'makefile', 'dockerfile', 'vagrantfile',
  'ipynb', 'lock', 'bazel',
]);

function isTextFile(name: string): boolean {
  // Files without extension (Makefile, Dockerfile, etc.)
  const lower = name.toLowerCase();
  if (['makefile', 'dockerfile', 'vagrantfile', 'procfile', 'gemfile', 'rakefile'].includes(lower)) {
    return true;
  }
  // Dotfiles
  if (lower.startsWith('.') && !lower.includes('.', 1)) return true;
  const ext = lower.split('.').pop() ?? '';
  return TEXT_EXTENSIONS.has(ext);
}

export interface OpenFolderResult {
  dirHandle: FileSystemDirectoryHandle;
  dirName: string;
  files: Record<string, string>;
}

/**
 * Open a local directory via the File System Access API.
 * Recursively reads all text files and returns them as a flat map.
 */
export async function openLocalFolder(): Promise<OpenFolderResult> {
  const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const files: Record<string, string> = {};
  await readDirRecursive(dirHandle, '', files);
  return { dirHandle, dirName: dirHandle.name, files };
}

async function readDirRecursive(
  handle: FileSystemDirectoryHandle,
  prefix: string,
  out: Record<string, string>,
): Promise<void> {
  for await (const entry of handle.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      if (SKIP_DIRS.has(entry.name)) continue;
      const subHandle = await handle.getDirectoryHandle(entry.name);
      await readDirRecursive(subHandle, path, out);
    } else {
      if (!isTextFile(entry.name)) continue;
      try {
        const fileHandle = await handle.getFileHandle(entry.name);
        const file = await fileHandle.getFile();
        const text = await file.text();
        out[path] = text;
      } catch {
        // Skip files we can't read
      }
    }
  }
}

/**
 * Write a single file to the local directory.
 */
export async function saveFileToLocal(
  dirHandle: FileSystemDirectoryHandle,
  relativePath: string,
  content: string,
): Promise<void> {
  const parts = relativePath.split('/');
  let currentDir = dirHandle;

  // Navigate/create intermediate directories
  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
  }

  const fileName = parts[parts.length - 1];
  const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Write all VFS files to the local directory.
 */
export async function saveAllToLocal(
  dirHandle: FileSystemDirectoryHandle,
  files: Record<string, string>,
): Promise<number> {
  let count = 0;
  for (const [path, content] of Object.entries(files)) {
    await saveFileToLocal(dirHandle, path, content);
    count++;
  }
  return count;
}
