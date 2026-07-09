import { homedir } from 'node:os';
import { isAbsolute, join, normalize as pathNormalize, relative, resolve } from 'node:path';
import { canonicalizeName } from './names.js';

/** Resolve adapter target base + skill name (project-relative or absolute global). */
export function resolveAdapterTarget(basePath: string, skillName: string, cwd = process.cwd()): string {
  const resolvedBase = basePath.startsWith('.') ? join(cwd, basePath) : basePath;
  return join(resolvedBase, skillName);
}

/** Expand a leading tilde to the user home directory. */
export function expandTilde(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

const PORTABLE_STORE_PREFIX = '~/.skillctl/skills/';

/** Portable canonical store path for committable lockfiles. */
export function formatCanonicalPathForLock(skillName: string): string {
  return `${PORTABLE_STORE_PREFIX}${canonicalizeName(skillName)}`;
}

/** Resolve lock canonicalPath (tilde, legacy absolute, or store-relative) to a filesystem path. */
export function resolveCanonicalPath(canonicalPath: string, store?: string): string {
  const storeRoot = store ?? join(homedir(), '.skillctl', 'skills');

  if (canonicalPath.startsWith(PORTABLE_STORE_PREFIX)) {
    const name = canonicalPath.slice(PORTABLE_STORE_PREFIX.length);
    return join(storeRoot, name);
  }

  const expanded = expandTilde(canonicalPath);
  if (isAbsolute(expanded)) {
    return pathNormalize(expanded);
  }

  return join(storeRoot, canonicalPath);
}

/** Resolve an untrusted relative path and require it to remain inside root. */
export function resolvePathInside(root: string, candidate: string, label = 'path'): string {
  if (!candidate || isAbsolute(candidate)) {
    throw new Error(`Unsafe ${label}: absolute or empty paths are not allowed`);
  }
  const rootAbs = resolve(root);
  const result = resolve(rootAbs, candidate);
  const rel = relative(rootAbs, result);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Unsafe ${label}: path escapes its root (${candidate})`);
  }
  return result;
}
