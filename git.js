/* ============================================================
   PyCode — Git Module
   In-browser Git using isomorphic-git + LightningFS
   ============================================================ */

const GitModule = (function () {
  'use strict';

  let fs = null;
  let pfs = null;      // promisified fs
  let gitReady = false;
  let currentDbName = 'pycode-fs';
  const dir = '/repo';
  const corsProxy = 'https://cors.isomorphic-git.org';
  const author = { name: 'PyCode User', email: 'user@pycode.dev' };

  // ─── Initialization ──────────────────────────────────────

  async function init(vfsGetAllFiles, fsName) {
    try {
      if (fsName) currentDbName = fsName;
      fs = new LightningFS(currentDbName);
      pfs = fs.promises;

      // Create repo directory
      try { await pfs.mkdir(dir); } catch (e) { /* exists */ }

      // Check if already initialized
      let needsInit = false;
      try {
        await pfs.stat(dir + '/.git');
      } catch (e) {
        needsInit = true;
      }

      if (needsInit) {
        await git.init({ fs, dir });

        // Sync initial files from VFS to git FS
        const files = vfsGetAllFiles();
        for (const [path, content] of Object.entries(files)) {
          await writeFileRecursive(dir + '/' + path, content);
        }

        // Stage and commit all initial files
        for (const path of Object.keys(files)) {
          await git.add({ fs, dir, filepath: path });
        }

        await git.commit({
          fs, dir,
          message: 'Initial commit',
          author
        });
      }

      gitReady = true;
      return true;
    } catch (err) {
      console.error('Git init failed:', err);
      return false;
    }
  }

  function isReady() {
    return gitReady;
  }

  // ─── Clone ──────────────────────────────────────────────

  async function clearRepo() {
    // Recursively delete everything under /repo
    async function rmrf(path) {
      try {
        const entries = await pfs.readdir(path);
        for (const entry of entries) {
          const full = path + '/' + entry;
          try {
            const stat = await pfs.stat(full);
            if (stat.isDirectory()) {
              await rmrf(full);
            } else {
              await pfs.unlink(full);
            }
          } catch (e) { /* skip */ }
        }
        if (path !== dir) await pfs.rmdir(path);
      } catch (e) { /* skip */ }
    }
    await rmrf(dir);
  }

  async function clone(url, onProgress, fsName) {
    try {
      if (!fs) {
        if (fsName) currentDbName = fsName;
        fs = new LightningFS(currentDbName);
        pfs = fs.promises;
      }

      // Wipe existing repo
      if (onProgress) onProgress({ phase: 'Clearing workspace...' });
      await clearRepo();

      // Ensure dir exists
      try { await pfs.mkdir(dir); } catch (e) { /* exists */ }

      if (onProgress) onProgress({ phase: `Cloning ${url}...` });

      await git.clone({
        fs,
        http: GitHttp,
        dir,
        url,
        corsProxy,
        singleBranch: true,
        depth: 1,
        onProgress: onProgress || undefined,
      });

      gitReady = true;
      return true;
    } catch (err) {
      console.error('Git clone failed:', err);
      throw err;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────

  async function writeFileRecursive(filepath, content) {
    const parts = filepath.split('/');
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current += (i === 0 ? '' : '/') + parts[i];
      if (!current) continue;
      try { await pfs.mkdir(current); } catch (e) { /* exists */ }
    }
    await pfs.writeFile(filepath, content, 'utf8');
  }

  async function fileExists(filepath) {
    try {
      await pfs.stat(filepath);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ─── Sync VFS ↔ Git FS ──────────────────────────────────

  async function syncVfsToGitFS(vfsGetAllFiles) {
    if (!gitReady) return;
    const files = vfsGetAllFiles();

    // Get existing files in git working tree
    const existingFiles = await listFilesRecursive(dir, '');

    // Write/update files from VFS
    for (const [path, content] of Object.entries(files)) {
      await writeFileRecursive(dir + '/' + path, content);
    }

    // Remove files from git FS that aren't in VFS
    for (const existingPath of existingFiles) {
      if (!files.hasOwnProperty(existingPath)) {
        try {
          await pfs.unlink(dir + '/' + existingPath);
        } catch (e) { /* ignore */ }
      }
    }
  }

  async function listFilesRecursive(basePath, relativePath) {
    const results = [];
    try {
      const entries = await pfs.readdir(basePath + (relativePath ? '/' + relativePath : ''));
      for (const entry of entries) {
        if (entry === '.git') continue;
        const rel = relativePath ? relativePath + '/' + entry : entry;
        const fullPath = basePath + '/' + rel;
        try {
          const stat = await pfs.stat(fullPath);
          if (stat.isDirectory()) {
            const sub = await listFilesRecursive(basePath, rel);
            results.push(...sub);
          } else {
            results.push(rel);
          }
        } catch (e) { /* skip */ }
      }
    } catch (e) { /* empty dir */ }
    return results;
  }

  async function syncGitFSToVfs(vfsSet, vfsClear) {
    if (!gitReady) return;
    vfsClear();
    const files = await listFilesRecursive(dir, '');
    for (const path of files) {
      try {
        const content = await pfs.readFile(dir + '/' + path, 'utf8');
        vfsSet(path, content);
      } catch (e) { /* skip binary/unreadable */ }
    }
  }

  // ─── Git Status ──────────────────────────────────────────

  async function status() {
    if (!gitReady) return [];

    const matrix = await git.statusMatrix({ fs, dir });
    const results = [];

    for (const [filepath, head, workdir, stage] of matrix) {
      let status = '';

      // Decode the status matrix
      // [HEAD, WORKDIR, STAGE]
      // [0, 2, 0] = new, untracked
      // [0, 2, 2] = new, staged (added)
      // [0, 2, 3] = new, staged + modified
      // [1, 1, 1] = unmodified
      // [1, 2, 1] = modified, unstaged
      // [1, 2, 2] = modified, staged
      // [1, 2, 3] = modified, staged + modified again
      // [1, 0, 0] = deleted, unstaged
      // [1, 0, 1] = deleted, staged
      // [1, 1, 3] = unmodified, staged (added from last commit but unchanged)

      if (head === 0 && workdir === 2 && stage === 0) {
        status = 'untracked';
      } else if (head === 0 && workdir === 2 && stage === 2) {
        status = 'added';
      } else if (head === 0 && workdir === 2 && stage === 3) {
        status = 'added-modified';
      } else if (head === 1 && workdir === 1 && stage === 1) {
        continue; // unmodified, skip
      } else if (head === 1 && workdir === 2 && stage === 1) {
        status = 'modified';
      } else if (head === 1 && workdir === 2 && stage === 2) {
        status = 'staged';
      } else if (head === 1 && workdir === 2 && stage === 3) {
        status = 'staged-modified';
      } else if (head === 1 && workdir === 0 && stage === 0) {
        status = 'deleted';
      } else if (head === 1 && workdir === 0 && stage === 1) {
        status = 'deleted-staged';
      } else if (head === 1 && workdir === 1 && stage === 3) {
        status = 'staged';
      } else {
        status = 'unknown';
      }

      results.push({ filepath, status, head, workdir, stage });
    }

    return results;
  }

  // ─── Staging ─────────────────────────────────────────────

  async function add(filepath) {
    if (!gitReady) return;
    await git.add({ fs, dir, filepath });
  }

  async function addAll(vfsGetAllFiles) {
    if (!gitReady) return;
    await syncVfsToGitFS(vfsGetAllFiles);
    const statusList = await status();
    for (const entry of statusList) {
      if (entry.status === 'deleted' || entry.status === 'deleted-staged') {
        await git.remove({ fs, dir, filepath: entry.filepath });
      } else {
        await git.add({ fs, dir, filepath: entry.filepath });
      }
    }
  }

  async function unstage(filepath) {
    if (!gitReady) return;
    // Reset to HEAD
    try {
      await git.resetIndex({ fs, dir, filepath });
    } catch (e) {
      console.warn('Unstage failed:', e);
    }
  }

  // ─── Commit ──────────────────────────────────────────────

  async function commit(message) {
    if (!gitReady) return null;
    if (!message || !message.trim()) return null;

    try {
      const sha = await git.commit({
        fs, dir,
        message: message.trim(),
        author
      });
      return sha;
    } catch (err) {
      console.error('Commit failed:', err);
      throw err;
    }
  }

  // ─── Log ─────────────────────────────────────────────────

  async function log(count = 50) {
    if (!gitReady) return [];
    try {
      const commits = await git.log({ fs, dir, depth: count });
      return commits.map(c => ({
        sha: c.oid.slice(0, 7),
        fullSha: c.oid,
        message: c.commit.message,
        author: c.commit.author.name,
        date: new Date(c.commit.author.timestamp * 1000),
        dateStr: formatDate(new Date(c.commit.author.timestamp * 1000))
      }));
    } catch (e) {
      return [];
    }
  }

  function formatDate(d) {
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  // ─── Diff ────────────────────────────────────────────────

  async function diff(filepath) {
    if (!gitReady) return { oldContent: '', newContent: '' };

    let oldContent = '';
    let newContent = '';

    // Get HEAD version
    try {
      const commitOid = await git.resolveRef({ fs, dir, ref: 'HEAD' });
      const { blob } = await git.readBlob({
        fs, dir, oid: commitOid, filepath
      });
      oldContent = new TextDecoder().decode(blob);
    } catch (e) {
      oldContent = ''; // new file
    }

    // Get working tree version
    try {
      newContent = await pfs.readFile(dir + '/' + filepath, 'utf8');
    } catch (e) {
      newContent = ''; // deleted file
    }

    return { oldContent, newContent };
  }

  // ─── Branches ────────────────────────────────────────────

  async function currentBranch() {
    if (!gitReady) return 'main';
    try {
      const branch = await git.currentBranch({ fs, dir, fullname: false });
      return branch || 'HEAD';
    } catch (e) {
      return 'main';
    }
  }

  async function listBranches() {
    if (!gitReady) return ['main'];
    try {
      return await git.listBranches({ fs, dir });
    } catch (e) {
      return ['main'];
    }
  }

  async function createBranch(name) {
    if (!gitReady) return;
    await git.branch({ fs, dir, ref: name });
  }

  async function checkout(branchName) {
    if (!gitReady) return;
    await git.checkout({ fs, dir, ref: branchName });
  }

  async function deleteBranch(name) {
    if (!gitReady) return;
    await git.deleteBranch({ fs, dir, ref: name });
  }

  // ─── Public API ──────────────────────────────────────────

  return {
    init,
    isReady,
    clone,
    syncVfsToGitFS,
    syncGitFSToVfs,
    status,
    add,
    addAll,
    unstage,
    commit,
    log,
    diff,
    currentBranch,
    listBranches,
    createBranch,
    checkout,
    deleteBranch,
  };
})();
