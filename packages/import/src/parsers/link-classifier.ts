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
  return pathResolve(storeRoot).replace(/\\/g, '/').toLowerCase();
}

function isUnderStore(resolved: string, storeRoot: string): boolean {
  const norm = pathResolve(resolved).replace(/\\/g, '/').toLowerCase();
  const store = normalizeStoreRoot(storeRoot);
  return norm === store || norm.startsWith(`${store}/`);
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

    if (isUnderStore(resolvedPath, storeRoot)) {
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