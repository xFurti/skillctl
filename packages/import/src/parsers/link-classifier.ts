import { lstat, realpath, stat } from 'node:fs/promises';
import { resolve as pathResolve } from 'node:path';
import { hasSkillMd } from './skill-md.js';

export type SkillLinkKind = 'local-copy' | 'skillctl-link' | 'external-link' | 'broken';

export interface ClassifiedSkillPath {
  kind: SkillLinkKind;
  resolvedPath: string;
  canonicalName?: string;
}

function normalizeStoreRoot(storeRoot: string): string {
  return normalizePath(storeRoot);
}

async function isUnderStore(resolved: string, storeRoot: string): Promise<boolean> {
  const norm = normalizePath(resolved);
  // macOS resolves /tmp through /private/tmp; resolve the configured store too
  // so it can be compared with the realpath obtained from a link target.
  const store = normalizeStoreRoot(await realpath(storeRoot).catch(() => storeRoot));
  return norm === store || norm.startsWith(`${store}/`);
}

function normalizePath(path: string): string {
  const normalized = pathResolve(path).replace(/\\/g, '/');
  // Windows realpath() may return an extended-length path (//?/C:/...).
  // Strip that prefix before comparing it with the ordinary configured store path.
  return (normalized.startsWith('//?/') ? normalized.slice(4) : normalized).toLowerCase();
}

export async function classifySkillPath(localPath: string, storeRoot: string): Promise<ClassifiedSkillPath> {
  try {
    const lst = await lstat(localPath);
    if (!lst.isDirectory() && !lst.isSymbolicLink()) {
      return { kind: 'broken', resolvedPath: localPath };
    }

    let resolvedPath: string;
    try {
      resolvedPath = await realpath(localPath);
    } catch {
      return { kind: 'broken', resolvedPath: localPath };
    }

    if (await isUnderStore(resolvedPath, storeRoot)) {
      const parts = pathResolve(resolvedPath).split(/[/\\]/);
      const canonicalName = parts[parts.length - 1];
      return { kind: 'skillctl-link', resolvedPath, canonicalName };
    }

    try {
      const st = await stat(resolvedPath);
      if (!st.isDirectory()) {
        return { kind: 'broken', resolvedPath };
      }
    } catch {
      return { kind: 'broken', resolvedPath };
    }

    if (!(await hasSkillMd(resolvedPath))) {
      return { kind: 'broken', resolvedPath };
    }

    const isLink = lst.isSymbolicLink() || pathResolve(resolvedPath) !== pathResolve(localPath);
    return {
      kind: isLink ? 'external-link' : 'local-copy',
      resolvedPath,
    };
  } catch {
    return { kind: 'broken', resolvedPath: localPath };
  }
}
