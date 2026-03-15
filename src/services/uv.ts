/**
 * UV Commands — workspace dependency management simulation.
 */

import type { VirtualFileSystem } from './vfs';
import { parseTOML } from './toml';

type TOMLRecord = Record<string, unknown>;

// Native/compiled packages that cannot run in Pyodide
const NATIVE_SKIP_LIST = new Set([
  'ruff', 'ty', 'pre-commit', 'import-linter', 'mypy', 'black',
  'pyright', 'pylint', 'isort', 'flake8', 'bandit', 'safety',
  'uvicorn', 'gunicorn', 'uvloop', 'watchdog', 'psutil',
]);

export interface UvSyncResult {
  projectName: string;
  memberNames: string[];
  thirdPartyDeps: string[];
  skippedDeps: string[];
  srcPaths: string[];
}

/** Find all pyproject.toml files in the VFS */
export function findAllPyprojectTomls(vfs: VirtualFileSystem): Record<string, string> {
  const results: Record<string, string> = {};
  for (const [path, entry] of vfs.entries()) {
    if (entry.type === 'file' && path.endsWith('pyproject.toml')) {
      results[path] = entry.content ?? '';
    }
  }
  return results;
}

/** Find workspace member pyproject.toml files (non-root) */
export function findWorkspaceMembers(vfs: VirtualFileSystem): Record<string, TOMLRecord> {
  const all = findAllPyprojectTomls(vfs);
  const members: Record<string, TOMLRecord> = {};
  for (const [path, content] of Object.entries(all)) {
    if (path !== 'pyproject.toml') {
      members[path] = parseTOML(content) as TOMLRecord;
    }
  }
  return members;
}

/** Find src/ directories for workspace members */
export function findWorkspaceSrcPaths(vfs: VirtualFileSystem): string[] {
  const allFiles = vfs.getAllFiles();
  const srcDirs = new Set<string>();
  for (const filePath of Object.keys(allFiles)) {
    const m = filePath.match(/^(.+\/src)\//);
    if (m) srcDirs.add('/' + m[1]);
  }
  return Array.from(srcDirs);
}

/**
 * Analyse workspace and return what needs to be installed.
 * Pure logic — no terminal output.
 */
export function analyseUvSync(vfs: VirtualFileSystem): UvSyncResult | null {
  const rootEntry = vfs.get('pyproject.toml');
  if (!rootEntry || rootEntry.type !== 'file') return null;

  const root = parseTOML(rootEntry.content ?? '') as TOMLRecord;
  const members = findWorkspaceMembers(vfs);

  const memberNames = Object.entries(members)
    .map(([p, m]) => {
      const project = m.project as TOMLRecord | undefined;
      return (project?.name as string) || p.split('/').slice(-2, -1)[0];
    })
    .filter(Boolean);

  const depGroups = (root['dependency-groups'] || {}) as Record<string, unknown[]>;
  const allDeps: string[] = [];
  const skippedDeps: string[] = [];

  for (const [, deps] of Object.entries(depGroups)) {
    if (Array.isArray(deps)) {
      for (const dep of deps) {
        const depName = typeof dep === 'string' ? dep.split(/[>=<[]/)[0].trim() : '';
        if (!depName || memberNames.includes(depName)) continue;
        if (NATIVE_SKIP_LIST.has(depName)) {
          skippedDeps.push(depName);
        } else {
          allDeps.push(depName);
        }
      }
    }
  }

  const rootProject = root.project as TOMLRecord | undefined;
  const rootDeps = (rootProject?.dependencies || []) as string[];
  for (const dep of rootDeps) {
    const depName = typeof dep === 'string' ? dep.split(/[>=<[]/)[0].trim() : '';
    if (!depName || memberNames.includes(depName) || allDeps.includes(depName)) continue;
    if (NATIVE_SKIP_LIST.has(depName)) {
      skippedDeps.push(depName);
    } else {
      allDeps.push(depName);
    }
  }

  return {
    projectName: (rootProject?.name as string) || 'unknown',
    memberNames,
    thirdPartyDeps: allDeps,
    skippedDeps,
    srcPaths: findWorkspaceSrcPaths(vfs),
  };
}

/**
 * Resolve a `uv run --package <pkg> <script>` entrypoint.
 */
export function resolveUvRunEntrypoint(
  vfs: VirtualFileSystem,
  pkgName: string,
  entryName: string,
): string | null {
  const members = findWorkspaceMembers(vfs);
  for (const [, parsed] of Object.entries(members)) {
    const project = parsed.project as TOMLRecord | undefined;
    if (project?.name === pkgName) {
      const scripts = (project?.scripts || {}) as Record<string, string>;
      return scripts[entryName] || null;
    }
  }
  return null;
}
