/**
 * Git Module — in-browser Git using isomorphic-git + LightningFS.
 * Ported from the vanilla git.js module.
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';

let fs: InstanceType<typeof LightningFS> | null = null;
let pfs: any = null;
let gitReady = false;
let currentDbName = 'pycode-fs';
const dir = '/repo';

function getAuthor() {
  return {
    name: localStorage.getItem('git-user-name') || 'PyCode User',
    email: localStorage.getItem('git-user-email') || 'user@pycode.dev',
  };
}

// ─── Helpers ─────────────────────────────────────────────

async function writeFileRecursive(filepath: string, content: string): Promise<void> {
  if (!pfs) return;
  const parts = filepath.split('/');
  let current = '';
  for (let i = 0; i < parts.length - 1; i++) {
    current += (i === 0 ? '' : '/') + parts[i];
    if (!current) continue;
    try { await pfs.mkdir(current); } catch { /* exists */ }
  }
  await pfs.writeFile(filepath, content, 'utf8');
}

async function listFilesRecursive(basePath: string, relativePath: string): Promise<string[]> {
  if (!pfs) return [];
  const results: string[] = [];
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
      } catch { /* skip */ }
    }
  } catch { /* empty dir */ }
  return results;
}

function formatDate(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

// ─── Initialization ──────────────────────────────────────

export async function initGit(
  vfsGetAllFiles: () => Record<string, string>,
  fsName?: string,
  forceClean?: boolean,
): Promise<boolean> {
  try {
    if (fsName) currentDbName = fsName;

    // If forceClean, wipe the entire IndexedDB to start fresh
    if (forceClean) {
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name && db.name.includes(currentDbName)) {
            indexedDB.deleteDatabase(db.name);
          }
        }
      } catch { /* indexedDB.databases() not supported in all browsers */ }
      // Small delay for DB cleanup
      await new Promise(r => setTimeout(r, 50));
    }

    fs = new LightningFS(currentDbName);
    pfs = fs.promises;

    try { await pfs.mkdir(dir); } catch { /* exists */ }

    let needsInit = false;
    try {
      await pfs.stat(dir + '/.git');
    } catch {
      needsInit = true;
    }

    if (needsInit || forceClean) {
      await git.init({ fs, dir });
      const files = vfsGetAllFiles();
      for (const [path, content] of Object.entries(files)) {
        await writeFileRecursive(dir + '/' + path, content);
      }
      for (const path of Object.keys(files)) {
        await git.add({ fs, dir, filepath: path });
      }
      await git.commit({
        fs, dir,
        message: 'Initial commit',
        author: getAuthor(),
      });
    }

    gitReady = true;
    return true;
  } catch (err) {
    console.error('Git init failed:', err);
    return false;
  }
}

export function isGitReady(): boolean {
  return gitReady;
}

// ─── Clone ──────────────────────────────────────────────

async function clearRepo(): Promise<void> {
  if (!pfs) return;
  async function rmrf(path: string) {
    try {
      const entries = await pfs!.readdir(path);
      for (const entry of entries) {
        const full = path + '/' + entry;
        try {
          const stat = await pfs!.stat(full);
          if (stat.isDirectory()) {
            await rmrf(full);
          } else {
            await pfs!.unlink(full);
          }
        } catch { /* skip */ }
      }
      if (path !== dir) await pfs!.rmdir(path);
    } catch { /* skip */ }
  }
  await rmrf(dir);
}

export async function cloneRepo(
  url: string,
  onProgress?: (progress: { phase: string }) => void,
  fsName?: string,
): Promise<boolean> {
  try {
    if (!fs) {
      if (fsName) currentDbName = fsName;
      fs = new LightningFS(currentDbName);
      pfs = fs.promises;
    }

    if (onProgress) onProgress({ phase: 'Clearing workspace...' });
    await clearRepo();

    try { await pfs!.mkdir(dir); } catch { /* exists */ }

    if (onProgress) onProgress({ phase: `Cloning ${url}...` });

    await git.clone({
      fs: fs!,
      http,
      dir,
      url,
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

// ─── Sync VFS ↔ Git FS ──────────────────────────────────

export async function syncVfsToGitFS(
  vfsGetAllFiles: () => Record<string, string>,
): Promise<void> {
  if (!gitReady || !pfs) return;
  const files = vfsGetAllFiles();
  const existingFiles = await listFilesRecursive(dir, '');

  for (const [path, content] of Object.entries(files)) {
    // Only write if content actually changed to avoid mtime updates
    let existing: string | null = null;
    try {
      existing = await pfs.readFile(dir + '/' + path, 'utf8') as string;
    } catch { /* file doesn't exist yet */ }
    if (existing !== content) {
      await writeFileRecursive(dir + '/' + path, content);
    }
  }

  for (const existingPath of existingFiles) {
    if (!Object.prototype.hasOwnProperty.call(files, existingPath)) {
      try { await pfs.unlink(dir + '/' + existingPath); } catch { /* ignore */ }
    }
  }
}

export async function syncGitFSToVfs(
  vfsSet: (path: string, content: string) => void,
  vfsClear: () => void,
): Promise<void> {
  if (!gitReady || !pfs) return;
  vfsClear();
  const files = await listFilesRecursive(dir, '');
  for (const path of files) {
    try {
      const content = await pfs.readFile(dir + '/' + path, 'utf8') as string;
      vfsSet(path, content);
    } catch { /* skip binary */ }
  }
}

// ─── Status ──────────────────────────────────────────────

export interface GitStatusEntry {
  filepath: string;
  status: string;
  head: number;
  workdir: number;
  stage: number;
}

export async function gitStatus(): Promise<GitStatusEntry[]> {
  if (!gitReady || !fs || !pfs) return [];
  const matrix = await git.statusMatrix({ fs, dir });
  const results: GitStatusEntry[] = [];

  for (const [filepath, head, workdir, stage] of matrix) {
    let status = '';
    if (head === 0 && workdir === 2 && stage === 0) status = 'untracked';
    else if (head === 0 && workdir === 2 && stage === 2) status = 'added';
    else if (head === 0 && workdir === 2 && stage === 3) status = 'added-modified';
    else if (head === 1 && workdir === 1 && stage === 1) continue; // unmodified
    else if (head === 1 && workdir === 2 && stage === 1) status = 'modified';
    else if (head === 1 && workdir === 2 && stage === 2) status = 'staged';
    else if (head === 1 && workdir === 2 && stage === 3) status = 'staged-modified';
    else if (head === 1 && workdir === 0 && stage === 0) status = 'deleted';
    else if (head === 1 && workdir === 0 && stage === 1) status = 'deleted-staged';
    else if (head === 1 && workdir === 1 && stage === 3) status = 'staged';
    else status = 'unknown';

    // Content-based verification: if statusMatrix says modified but content is identical, skip
    if (status === 'modified' && head === 1 && workdir === 2) {
      try {
        const workdirContent = await pfs.readFile(dir + '/' + filepath, 'utf8') as string;
        const headBlob = await git.readBlob({ fs, dir, oid: await git.resolveRef({ fs, dir, ref: 'HEAD' }), filepath: filepath as string });
        const headContent = new TextDecoder().decode(headBlob.blob);
        if (workdirContent === headContent) continue; // Actually unchanged
      } catch { /* If comparison fails, keep the status as-is */ }
    }

    results.push({ filepath: filepath as string, status, head, workdir, stage });
  }
  return results;
}

// ─── Staging ─────────────────────────────────────────────

export async function gitAdd(filepath: string): Promise<void> {
  if (!gitReady || !fs) return;
  await git.add({ fs, dir, filepath });
}

export async function gitAddAll(
  vfsGetAllFiles: () => Record<string, string>,
): Promise<void> {
  if (!gitReady || !fs) return;
  await syncVfsToGitFS(vfsGetAllFiles);
  const statusList = await gitStatus();
  for (const entry of statusList) {
    if (entry.status === 'deleted' || entry.status === 'deleted-staged') {
      await git.remove({ fs, dir, filepath: entry.filepath });
    } else {
      await git.add({ fs, dir, filepath: entry.filepath });
    }
  }
}

export async function gitUnstage(filepath: string): Promise<void> {
  if (!gitReady || !fs) return;
  try {
    await git.resetIndex({ fs, dir, filepath });
  } catch (e) {
    console.warn('Unstage failed:', e);
  }
}

/** Discard working-tree changes for a file (restore to HEAD version) */
export async function gitDiscardFile(filepath: string): Promise<string | null> {
  if (!gitReady || !fs || !pfs) return null;
  try {
    const commitOid = await git.resolveRef({ fs, dir, ref: 'HEAD' });
    const { blob } = await git.readBlob({ fs, dir, oid: commitOid, filepath });
    const content = new TextDecoder().decode(blob);
    await writeFileRecursive(dir + '/' + filepath, content);
    return content;
  } catch {
    // File didn't exist at HEAD — it's untracked, delete it
    try {
      await pfs.unlink(dir + '/' + filepath);
    } catch { /* ignore */ }
    return null;
  }
}

/** Reset a file: unstage + discard changes */
export async function gitResetFile(filepath: string): Promise<string | null> {
  if (!gitReady || !fs) return null;
  await gitUnstage(filepath);
  return await gitDiscardFile(filepath);
}

// ─── Commit ──────────────────────────────────────────────

export async function gitCommit(message: string): Promise<string | null> {
  if (!gitReady || !fs) return null;
  if (!message?.trim()) return null;
  try {
    const sha = await git.commit({
      fs, dir,
      message: message.trim(),
      author: getAuthor(),
    });
    return sha;
  } catch (err) {
    console.error('Commit failed:', err);
    throw err;
  }
}

// ─── Log ─────────────────────────────────────────────────

export interface GitLogEntry {
  sha: string;
  fullSha: string;
  message: string;
  author: string;
  date: Date;
  dateStr: string;
}

export async function gitLog(count = 50): Promise<GitLogEntry[]> {
  if (!gitReady || !fs) return [];
  try {
    const commits = await git.log({ fs, dir, depth: count });
    return commits.map((c) => ({
      sha: c.oid.slice(0, 7),
      fullSha: c.oid,
      message: c.commit.message,
      author: c.commit.author.name,
      date: new Date(c.commit.author.timestamp * 1000),
      dateStr: formatDate(new Date(c.commit.author.timestamp * 1000)),
    }));
  } catch {
    return [];
  }
}

// ─── Diff ────────────────────────────────────────────────

export async function gitDiff(
  filepath: string,
): Promise<{ oldContent: string; newContent: string }> {
  if (!gitReady || !fs || !pfs) return { oldContent: '', newContent: '' };
  let oldContent = '';
  let newContent = '';

  try {
    const commitOid = await git.resolveRef({ fs, dir, ref: 'HEAD' });
    const { blob } = await git.readBlob({ fs, dir, oid: commitOid, filepath });
    oldContent = new TextDecoder().decode(blob);
  } catch {
    oldContent = '';
  }

  try {
    newContent = await pfs.readFile(dir + '/' + filepath, 'utf8') as string;
  } catch {
    newContent = '';
  }

  return { oldContent, newContent };
}

// ─── Branches ────────────────────────────────────────────

export async function gitCurrentBranch(): Promise<string> {
  if (!gitReady || !fs) return 'main';
  try {
    const branch = await git.currentBranch({ fs, dir, fullname: false });
    return branch || 'HEAD';
  } catch {
    return 'main';
  }
}

export async function gitListBranches(): Promise<string[]> {
  if (!gitReady || !fs) return ['main'];
  try {
    return await git.listBranches({ fs, dir });
  } catch {
    return ['main'];
  }
}

export async function gitCreateBranch(name: string): Promise<void> {
  if (!gitReady || !fs) return;
  await git.branch({ fs, dir, ref: name });
}

export async function gitCheckout(branchName: string): Promise<void> {
  if (!gitReady || !fs) return;
  await git.checkout({ fs, dir, ref: branchName });
}

export async function gitDeleteBranch(name: string): Promise<void> {
  if (!gitReady || !fs) return;
  await git.deleteBranch({ fs, dir, ref: name });
}

// ─── Remotes ──────────────────────────────────────────────

export async function gitAddRemote(name: string, url: string): Promise<void> {
  if (!gitReady || !fs) return;
  try {
    await git.addRemote({ fs, dir, remote: name, url });
  } catch {
    // Remote already exists — delete and re-add
    await git.deleteRemote({ fs, dir, remote: name });
    await git.addRemote({ fs, dir, remote: name, url });
  }
}

export async function gitGetRemoteUrl(name = 'origin'): Promise<string | null> {
  if (!gitReady || !fs) return null;
  try {
    const remotes = await git.listRemotes({ fs, dir });
    const remote = remotes.find((r) => r.remote === name);
    return remote?.url ?? null;
  } catch {
    return null;
  }
}

export async function gitListRemotes(): Promise<{ remote: string; url: string }[]> {
  if (!gitReady || !fs) return [];
  try {
    return await git.listRemotes({ fs, dir });
  } catch {
    return [];
  }
}

// ─── Push / Pull ───────────────────────────────────────────

export async function gitPush(
  token: string,
  onProgress?: (progress: unknown) => void,
): Promise<void> {
  if (!gitReady || !fs) throw new Error('Git not initialized');
  if (!token) throw new Error('GitHub PAT required for push');

  const branch = await gitCurrentBranch();
  await git.push({
    fs: fs!,
    http,
    dir,
    remote: 'origin',
    ref: branch,
    onAuth: () => ({ username: token, password: 'x-oauth-basic' }),
    onProgress: onProgress || undefined,
  });
}

export async function gitPull(
  token?: string | null,
  onProgress?: (progress: unknown) => void,
): Promise<void> {
  if (!gitReady || !fs) throw new Error('Git not initialized');

  const branch = await gitCurrentBranch();
  await git.pull({
    fs: fs!,
    http,
    dir,
    ref: branch,
    singleBranch: true,
    author: getAuthor(),
    onAuth: token ? () => ({ username: token, password: 'x-oauth-basic' }) : undefined,
    onProgress: onProgress || undefined,
  });
}
