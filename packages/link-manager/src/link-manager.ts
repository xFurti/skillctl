/**
 * LinkManager (from PR5 patterns, implemented for PR6).
 * Handles cross-platform linking: symlink (dir), junction (win), copy fallback.
 * Safety: realpath verification to ensure targets point inside canonical store.
 * Used by AgentAdapters' ensureTarget/removeTarget.
 */

import { symlink, rm, stat, realpath, access, constants, cp as fsCp } from 'node:fs/promises';
import { join, dirname, relative, resolve as pathResolve } from 'node:path';
import { homedir } from 'node:os';
import type { LinkMode } from '@skillctl/core';
import { ensureDir } from '@skillctl/core';

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
      console.log(`[dry-run] would link ${canonical} -> ${target} (${mode})`);
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
            console.warn(`[link-manager] relative symlink failed for ${target}, falling back to copy`);
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
            console.warn(`[link-manager] junction failed for ${target}, falling back to copy`);
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
        console.warn(`[link-manager] link verification failed, falling back to copy for ${target}`);
        await this.copyDir(canonical, target);
      }
    } catch (err: any) {
      // general fallback to copy on error (e.g. EPERM no dev mode)
      if (mode !== 'copy') {
        console.warn(`[link-manager] link error (${err.code || err.message}), fallback copy: ${target}`);
        await this.copyDir(canonical, target);
      } else {
        throw err;
      }
    }
  }

  async removeLink(target: string): Promise<void> {
    try {
      const st = await stat(target).catch(() => null);
      if (!st) return;
      // remove regardless of symlink/junction/dir
      await rm(target, { recursive: true, force: true });
    } catch {
      // best effort
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
      return tReal.startsWith(storeReal);
    } catch {
      return true; // non existing ok
    }
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    await ensureDir(dest);
    // Use recursive cp (node 16.7+)
    await fsCp(src, dest, { recursive: true, force: true });
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
