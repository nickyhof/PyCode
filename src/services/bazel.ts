/**
 * Bazel BUILD parser and target resolution.
 */

import type { VirtualFileSystem } from './vfs';

export interface BazelTarget {
  rule: string;
  name: string | null;
  srcs: string[];
  main: string | null;
  deps: string[];
  imports: string[];
}

export interface BuildFileData {
  content: string;
  targets: BazelTarget[];
}

/** Parse a BUILD.bazel file to extract targets */
export function parseBUILD(text: string): BazelTarget[] {
  const targets: BazelTarget[] = [];
  const rulePattern = /(py_binary|py_library|py_test)\s*\(/g;
  let match;

  while ((match = rulePattern.exec(text)) !== null) {
    const rule = match[1];
    const startIdx = match.index + match[0].length;

    let depth = 1;
    let pos = startIdx;
    while (pos < text.length && depth > 0) {
      if (text[pos] === '(') depth++;
      else if (text[pos] === ')') depth--;
      pos++;
    }
    const body = text.slice(startIdx, pos - 1);

    const target: BazelTarget = {
      rule,
      name: extractBazelArg(body, 'name'),
      srcs: extractBazelListArg(body, 'srcs'),
      main: extractBazelArg(body, 'main'),
      deps: extractBazelListArg(body, 'deps'),
      imports: extractBazelListArg(body, 'imports'),
    };

    if (target.name) targets.push(target);
  }
  return targets;
}

function extractBazelArg(body: string, argName: string): string | null {
  const re = new RegExp(argName + '\\s*=\\s*["\']([^"\']*)["\']');
  const m = body.match(re);
  return m ? m[1] : null;
}

function extractBazelListArg(body: string, argName: string): string[] {
  const re = new RegExp(argName + '\\s*=\\s*\\[([^\\]]*?)\\]', 's');
  const m = body.match(re);
  if (!m) return [];
  const items: string[] = [];
  const itemRe = /["']([^"']*)["']/g;
  let im;
  while ((im = itemRe.exec(m[1])) !== null) {
    items.push(im[1]);
  }
  return items;
}

/** Find all BUILD files in the VFS */
export function findAllBUILDFiles(vfs: VirtualFileSystem): Record<string, BuildFileData> {
  const results: Record<string, BuildFileData> = {};
  for (const [path, entry] of vfs.entries()) {
    if (
      entry.type === 'file' &&
      (path.endsWith('/BUILD') ||
        path.endsWith('/BUILD.bazel') ||
        path === 'BUILD' ||
        path === 'BUILD.bazel')
    ) {
      results[path] = { content: entry.content ?? '', targets: parseBUILD(entry.content ?? '') };
    }
  }
  return results;
}

/** Convert BUILD file path to package path */
export function buildFilePkg(buildPath: string): string {
  return buildPath.replace(/\/?BUILD(\.bazel)?$/, '');
}

/** Resolve a Bazel label to a target */
export function resolveBazelTarget(
  label: string,
  vfs: VirtualFileSystem,
): { target: BazelTarget; pkg: string; buildPath: string } | null {
  let pkg = '';
  let name = '';
  if (label.startsWith('//')) {
    const rest = label.slice(2);
    const colonIdx = rest.indexOf(':');
    if (colonIdx !== -1) {
      pkg = rest.slice(0, colonIdx);
      name = rest.slice(colonIdx + 1);
    } else {
      pkg = rest;
      name = rest.split('/').pop()!;
    }
  } else if (label.startsWith(':')) {
    name = label.slice(1);
  } else {
    name = label;
  }

  const buildFiles = findAllBUILDFiles(vfs);
  for (const [buildPath, buildData] of Object.entries(buildFiles)) {
    const filePkg = buildFilePkg(buildPath);
    if (filePkg === pkg) {
      const target = buildData.targets.find((t) => t.name === name);
      if (target) return { target, pkg: filePkg, buildPath };
    }
  }
  return null;
}

/** Collect transitive dependency paths for sys.path */
export function collectBazelDeps(
  target: BazelTarget,
  pkg: string,
  vfs: VirtualFileSystem,
  visited = new Set<string>(),
): string[] {
  const paths = new Set<string>();
  if (pkg) paths.add('/' + pkg);

  for (const dep of target.deps || []) {
    if (visited.has(dep)) continue;
    visited.add(dep);

    const resolved = resolveBazelTarget(dep, vfs);
    if (resolved) {
      if (resolved.pkg) paths.add('/' + resolved.pkg);
      const subPaths = collectBazelDeps(resolved.target, resolved.pkg, vfs, visited);
      for (const p of subPaths) paths.add(p);
    }
  }
  return Array.from(paths);
}
