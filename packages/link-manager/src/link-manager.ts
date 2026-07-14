/**
 * LinkManager (from PR5 patterns, implemented for PR6).
 * Handles cross-platform linking: symlink (dir), junction (win), copy fallback.
 * Safety: realpath verification to ensure targets point inside canonical store.
 * Used by AgentAdapters' ensureTarget/removeTarget.
 */

import {
  symlink,
  rm,
  stat,
  lstat,
  realpath,
  access,
  constants,
  cp as fsCp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { join, dirname, relative, resolve as pathResolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import type { LinkMode } from '@skillctl/core';
import { computeDirIntegrity, ensureDir, matchesDirIntegrity } from '@skillctl/core';

const MANAGED_COPY_MARKER = '.skillctl-managed.json';

interface ManagedCopyMarker {
  version: 1;
  canonical: string;
  integrity: string;
}

export interface ManagedTargetInspection {
  kind: 'missing' | 'link' | 'copy' | 'unmanaged';
  canonical?: string;
}

export interface LinkOptions {
  mode?: LinkMode;
  dryRun?: boolean;
  force?: boolean;
  /** Use a relative symlink/junction source for project-scoped targets (git-portable). */
  relative?: boolean;
}

export class LinkManager {
  /**
   * Ensure a link (or copy) from canonical skill dir to a target path (agent's skills dir entry).
   * Creates parent dirs. Overwrites existing if force.
   * Verifies after creation that realpath(target) resolves to canonical.
   */
  async ensureLink(canonical: string, target: string, options: LinkOptions = {}): Promise<void> {
    const mode = options.mode || (process.platform === 'win32' ? 'junction' : 'symlink');
    const dry = !!options.dryRun;

    if (dry) {
      return;
    }

    await ensureDir(dirname(target));

    // cleanup existing
    if (options.force) {
      try {
        await rm(target, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    // Check if already correctly linked
    if (await this.isLinkedTo(canonical, target)) {
      return;
    }

    const existing = await lstat(target).catch(() => null);
    if (existing) {
      if (await this.isManagedCopy(canonical, target)) return;
      if (await this.hasManagedCopyMarker(canonical, target)) {
        await rm(target, { recursive: true, force: true });
      } else {
        throw new Error(`Refusing to overwrite unmanaged target: ${target}`);
      }
    }

    try {
      if (mode === 'copy') {
        await this.copyDir(canonical, target);
        return;
      }

      const canonAbs = pathResolve(canonical);
      const useRelative = !!options.relative;
      const linkSource = useRelative
        ? relative(dirname(pathResolve(target)), canonAbs) || '.'
        : canonAbs;

      if (useRelative) {
        // Project-scoped targets: relative links survive git clone on other machines.
        try {
          await symlink(linkSource, target, 'dir');
        } catch (e: any) {
          if (e.code === 'EPERM' || e.code === 'EEXIST') {
            await this.copyDir(canonical, target);
            return;
          }
          throw e;
        }
      } else if (mode === 'junction' || process.platform === 'win32') {
        // Global targets on Windows: absolute junction (relative junctions are unsupported).
        try {
          await symlink(canonAbs, target, 'junction');
        } catch (e: any) {
          if (e.code === 'EPERM' || e.code === 'EEXIST') {
            await this.copyDir(canonical, target);
            return;
          }
          throw e;
        }
      } else {
        await symlink(canonAbs, target, 'dir');
      }

      // verify
      if (!(await this.isLinkedTo(canonical, target))) {
        // cleanup bad link and fallback
        await rm(target, { recursive: true, force: true }).catch(() => {});
        await this.copyDir(canonical, target);
      }
    } catch (err: any) {
      // general fallback to copy on error (e.g. EPERM no dev mode)
      if (mode !== 'copy') {
        await this.copyDir(canonical, target);
      } else {
        throw err;
      }
    }
  }

  async removeLink(target: string, canonical?: string): Promise<void> {
    try {
      const st = await lstat(target).catch(() => null);
      if (!st) return;

      if (!canonical) {
        throw new Error('canonical path is required to remove a managed target safely');
      }

      const managedLink = await this.isLinkedTo(canonical, target);
      const managedCopy = await this.hasManagedCopyMarker(canonical, target);
      if (!managedLink && !managedCopy) {
        throw new Error('target is not a link or copy managed by skillctl');
      }

      await rm(target, { recursive: true, force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }

  /**
   * Check if target currently points (via realpath) to the canonical.
   */
  async isLinkedTo(canonical: string, target: string): Promise<boolean> {
    try {
      // realpath follows symlinks/junctions
      const targetReal = await realpath(target);
      const canonReal = await realpath(canonical).catch(() => canonical);
      return pathResolve(targetReal) === pathResolve(canonReal);
    } catch {
      return false;
    }
  }

  /**
   * Verify that a target (if exists) resolves inside the canonical store (prevent attacks).
   * Returns true if safe or does not exist.
   */
  async verifyTargetSafe(target: string, storeRoot: string): Promise<boolean> {
    try {
      const st = await stat(target);
      if (!st) return true;
      const tReal = await realpath(target);
      const storeReal = await realpath(storeRoot);
      const rel = relative(storeReal, tReal);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === 'ENOENT';
    }
  }

  async inspectManagedTarget(target: string, storeRoot: string): Promise<ManagedTargetInspection> {
    const existing = await lstat(target).catch(() => null);
    if (!existing) return { kind: 'missing' };
    const storeReal = await realpath(storeRoot).catch(() => pathResolve(storeRoot));

    if (existing.isSymbolicLink()) {
      const canonical = await realpath(target).catch(() => null);
      if (canonical && isPathInside(storeReal, canonical)) return { kind: 'link', canonical };
      return { kind: 'unmanaged' };
    }

    const marker = await this.readManagedCopyMarker(target);
    if (marker && isPathInside(storeReal, marker.canonical)) {
      return { kind: 'copy', canonical: marker.canonical };
    }
    return { kind: 'unmanaged' };
  }

  async targetState(canonical: string, target: string): Promise<'missing' | 'current' | 'managed-stale' | 'unmanaged'> {
    const existing = await lstat(target).catch(() => null);
    if (!existing) return 'missing';
    if (await this.isLinkedTo(canonical, target)) return 'current';
    if (await this.isManagedCopy(canonical, target)) return 'current';
    if (await this.hasManagedCopyMarker(canonical, target)) return 'managed-stale';
    return 'unmanaged';
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    const existing = await lstat(dest).catch(() => null);
    if (existing) {
      if (!(await this.hasManagedCopyMarker(src, dest))) {
        throw new Error(`Refusing to copy over unmanaged target: ${dest}`);
      }
      await rm(dest, { recursive: true, force: true });
    }
    await ensureDir(dest);
    await fsCp(src, dest, { recursive: true, force: true });
    const marker: ManagedCopyMarker = {
      version: 1,
      canonical: await realpath(src).catch(() => pathResolve(src)),
      integrity: await computeDirIntegrity(src),
    };
    await writeFile(join(dest, MANAGED_COPY_MARKER), `${JSON.stringify(marker)}\n`, 'utf8');
  }

  private async readManagedCopyMarker(target: string): Promise<ManagedCopyMarker | null> {
    try {
      const parsed = JSON.parse(await readFile(join(target, MANAGED_COPY_MARKER), 'utf8')) as ManagedCopyMarker;
      if (parsed.version !== 1 || !parsed.canonical || !parsed.integrity) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async hasManagedCopyMarker(canonical: string, target: string): Promise<boolean> {
    const marker = await this.readManagedCopyMarker(target);
    if (!marker) return false;
    const canonReal = await realpath(canonical).catch(() => pathResolve(canonical));
    return pathResolve(marker.canonical) === pathResolve(canonReal);
  }

  private async isManagedCopy(canonical: string, target: string): Promise<boolean> {
    const marker = await this.readManagedCopyMarker(target);
    if (!marker) return false;
    const canonReal = await realpath(canonical).catch(() => pathResolve(canonical));
    if (pathResolve(marker.canonical) !== pathResolve(canonReal)) return false;
    return matchesDirIntegrity(canonical, marker.integrity);
  }
}

// Singleton for convenience
export const linkManager = new LinkManager();

// Also export low level helpers used by adapters if needed
export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export { join, resolve as pathResolve } from 'node:path';
export { homedir } from 'node:os';

function isPathInside(root: string, candidate: string): boolean {
  const rel = relative(pathResolve(root), pathResolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
