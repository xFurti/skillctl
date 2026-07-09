/**
 * Base adapter helpers and interface re-export.
 * Adapters are independent per design.
 */
import type { AgentAdapter } from '@skillctl/core';
import { linkManager, pathExists } from '@skillctl/link-manager';
import { homedir } from 'node:os';
import { join } from 'node:path';

export { linkManager, pathExists };
export { join } from 'node:path';
export { homedir } from 'node:os';
export type { AgentAdapter };

/**
 * Helper to implement basic detect: check if any of the known paths exist (global or project).
 */
export async function basicDetect(projectPaths: string[], globalPaths: string[]): Promise<boolean> {
  const cwd = process.cwd();
  for (const p of projectPaths) {
    if (await pathExists(join(cwd, p))) return true;
  }
  for (const p of globalPaths) {
    if (await pathExists(p)) return true;
  }
  return false;
}

/**
 * Abstract-ish base, but since interface is simple and adapters small, concrete impls are direct.
 * This provides common ensure/remove using LinkManager.
 */
export abstract class BaseAgentAdapter implements AgentAdapter {
  readonly id: string;
  readonly name: string;
  readonly projectPaths: string[];
  readonly globalPaths: string[];

  constructor(id: string, name: string, projectPaths: string[], globalPaths: string[]) {
    this.id = id;
    this.name = name;
    this.projectPaths = projectPaths;
    this.globalPaths = globalPaths;
  }

  async detect(): Promise<boolean> {
    return basicDetect(this.projectPaths, this.globalPaths);
  }

  async ensureTarget(
    skillName: string,
    targetPath: string,
    canonical: string,
    mode?: 'symlink' | 'copy' | 'junction',
    options?: { relative?: boolean; dryRun?: boolean; force?: boolean }
  ): Promise<void> {
    await linkManager.ensureLink(canonical, targetPath, {
      mode,
      relative: options?.relative,
      dryRun: options?.dryRun,
      force: options?.force,
    });
  }

  async removeTarget(skillName: string, targetPath: string, canonical?: string): Promise<void> {
    await linkManager.removeLink(targetPath, canonical);
  }
}
