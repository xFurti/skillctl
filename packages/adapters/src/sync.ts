import type { AgentAdapter } from '@skillctl/core';
import { loadConfig, resolveAdapterTarget } from '@skillctl/core';
import { getEnabledAdapters } from './index.js';

export interface SkillTarget {
  name: string;
  canonicalPath: string;
}

export interface SyncOptions {
  mode?: 'symlink' | 'copy' | 'junction';
  dryRun?: boolean;
  adapters?: AgentAdapter[];
}

export async function syncSkillsToAgents(
  skills: SkillTarget[],
  options: SyncOptions = {}
): Promise<{ synced: number; adaptersUsed: string[]; notes: string[] }> {
  const cfg = await loadConfig();
  const mode = options.mode || cfg.defaultMode;
  const adapters = options.adapters || (await getEnabledAdapters(cfg));
  const cwd = process.cwd();

  const notes: string[] = [];
  let synced = 0;
  const used: string[] = [];

  for (const adapter of adapters) {
    const relevant = await adapter.detect();
    if (!relevant && !options.adapters) {
      notes.push(`Skipped ${adapter.name} (not detected)`);
      continue;
    }
    used.push(adapter.id);

    for (const basePath of adapter.projectPaths) {
      for (const skill of skills) {
        const fullTarget = resolveAdapterTarget(basePath, skill.name, cwd);
        try {
          await adapter.ensureTarget(skill.name, fullTarget, skill.canonicalPath, mode, { relative: true });
          synced++;
        } catch (e) {
          notes.push(`Failed ensure for ${skill.name} on ${adapter.id}: ${(e as Error).message}`);
        }
      }
    }

    for (const basePath of adapter.globalPaths) {
      for (const skill of skills) {
        const fullTarget = resolveAdapterTarget(basePath, skill.name, cwd);
        try {
          await adapter.ensureTarget(skill.name, fullTarget, skill.canonicalPath, mode);
          synced++;
        } catch (e) {
          notes.push(`Failed ensure for ${skill.name} on ${adapter.id}: ${(e as Error).message}`);
        }
      }
    }
  }

  return { synced, adaptersUsed: used, notes };
}

export { getEnabledAdapters, scanCoexistence } from './index.js';