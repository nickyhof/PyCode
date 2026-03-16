/**
 * Virtual File System — in-memory file storage backed by a Map.
 * Default project files are loaded from /default-project/ at startup.
 */

export interface VfsEntry {
  content: string | null;
  type: 'file' | 'directory';
}

export interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children: Record<string, TreeNode>;
}

export class VirtualFileSystem {
  private files = new Map<string, VfsEntry>();

  /** Normalise a path (strip leading slashes) */
  private norm(path: string): string {
    return path.replace(/^\/+/, '');
  }

  /** Load default project from /default-project/ manifest */
  async init(): Promise<void> {
    this.files.clear();
    try {
      const res = await fetch('/default-project/manifest.json');
      const manifest: string[] = await res.json();
      const fetches = manifest.map(async (path) => {
        const fileRes = await fetch(`/default-project/${path}`);
        const content = await fileRes.text();
        this.set(path, content);
      });
      await Promise.all(fetches);
    } catch (err) {
      console.error('Failed to load default project:', err);
    }
  }

  /** Set a file (and auto-create parent directories) */
  set(path: string, content: string): void {
    path = this.norm(path);
    this.files.set(path, { content, type: 'file' });
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!this.files.has(dir)) {
        this.files.set(dir, { content: null, type: 'directory' });
      }
    }
  }

  /** Get a file/directory entry */
  get(path: string): VfsEntry | undefined {
    return this.files.get(this.norm(path));
  }

  /** Delete a file or directory (recursively) */
  delete(path: string): void {
    path = this.norm(path);
    const toDelete: string[] = [];
    for (const key of this.files.keys()) {
      if (key === path || key.startsWith(path + '/')) {
        toDelete.push(key);
      }
    }
    toDelete.forEach((k) => this.files.delete(k));
  }

  /** Rename / move a file or directory */
  rename(oldPath: string, newPath: string): void {
    oldPath = this.norm(oldPath);
    newPath = this.norm(newPath);
    const entries: [string, VfsEntry][] = [];
    for (const [key, val] of this.files.entries()) {
      if (key === oldPath || key.startsWith(oldPath + '/')) {
        entries.push([key, val]);
      }
    }
    entries.forEach(([key, val]) => {
      this.files.delete(key);
      this.files.set(newPath + key.slice(oldPath.length), val);
    });
  }

  /** Build a nested tree structure (for file explorer) */
  tree(): TreeNode {
    const root: TreeNode = { name: 'root', type: 'directory', children: {}, path: '' };
    const paths = Array.from(this.files.keys()).sort();
    for (const path of paths) {
      const entry = this.files.get(path)!;
      const parts = path.split('/');
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        if (!node.children[name]) {
          node.children[name] = {
            name,
            type: i < parts.length - 1 ? 'directory' : entry.type,
            children: {},
            path: parts.slice(0, i + 1).join('/'),
          };
        }
        node = node.children[name];
      }
    }
    return root;
  }

  /** Get all files as a plain object { path: content } */
  getAllFiles(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [path, entry] of this.files.entries()) {
      if (entry.type === 'file') {
        result[path] = entry.content ?? '';
      }
    }
    return result;
  }

  /** Clear all files */
  clear(): void {
    this.files.clear();
  }

  /** Check if a path exists */
  has(path: string): boolean {
    return this.files.has(this.norm(path));
  }

  /** Get all paths */
  keys(): IterableIterator<string> {
    return this.files.keys();
  }

  /** Get all entries */
  entries(): IterableIterator<[string, VfsEntry]> {
    return this.files.entries();
  }
}
