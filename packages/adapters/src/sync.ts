import { readdir } from 'node:fs/promises';
import type { AgentAdapter, LinkMode } from '@skillctl/core';
import { getRegisteredAdapters, loadConfig, resolveAdapterTarget } from '@skillctl/core';
import { linkManager } from '@skillctl/link-manager';
import { getEnabledAdapters } from './index.js';

export interface SkillTarget {
  name: string;
  canonicalPath: string;
}

export type SyncScope = 'project' | 'global' | 'both';
export type SyncActionKind = 'created' | 'updated' | 'unchanged' | 'pruned' | 'skipped' | 'failed';

export interface SyncAction {
  skill: string;
  adapter: string;
  scope: 'project' | 'global';
  target: string;
  action: SyncActionKind;
  message?: string;
}

export interface SyncOptions {
  mode?: LinkMode;
  dryRun?: boolean;
  scope?: SyncScope;
  adapterIds?: string[];
  adapters?: AgentAdapter[];
  prune?: boolean;
}

export interface SyncResult {
  actions: SyncAction[];
  adaptersUsed: string[];
  counts: Record<SyncActionKind, number>;
  /** @deprecated Use counts/actions. */
  synced: number;
  /** @deprecated Use actions. */
  notes: string[];
}

export async function syncSkillsToAgents(
  skills: SkillTarget[],
  options: SyncOptions = {}
): Promise<SyncResult> {
  const cfg = await loadConfig();
  const mode = options.mode || cfg.defaultMode;
  const scope = options.scope || 'both';
  const explicit = Boolean(options.adapters || options.adapterIds?.length);
  const adapters = options.adapters || selectAdapters(options.adapterIds, await getEnabledAdapters(cfg));
  const cwd = process.cwd();
  const actions: SyncAction[] = [];
  const used: string[] = [];

  for (const adapter of adapters) {
    const relevant = explicit || (await adapter.detect());
    if (!relevant) {
      actions.push({
        skill: '*', adapter: adapter.id, scope: 'project', target: '', action: 'skipped',
        message: `${adapter.name} not detected`,
      });
      continue;
    }
    used.push(adapter.id);

    if (scope !== 'global') {
      for (const basePath of adapter.projectPaths) {
        await syncBase(adapter, basePath, 'project', skills, mode, cfg.store, cwd, options, actions);
      }
    }
    if (scope !== 'project') {
      for (const basePath of adapter.globalPaths) {
        await syncBase(adapter, basePath, 'global', skills, mode, cfg.store, cwd, options, actions);
      }
    }
  }

  const counts = emptyCounts();
  for (const action of actions) counts[action.action]++;
  return {
    actions,
    adaptersUsed: used,
    counts,
    synced: counts.created + counts.updated + counts.unchanged,
    notes: actions
      .filter((action) => action.action === 'failed' || action.action === 'skipped')
      .map((action) => action.message || `${action.action}: ${action.target}`),
  };
}

function selectAdapters(ids: string[] | undefined, enabled: AgentAdapter[]): AgentAdapter[] {
  if (!ids?.length) return enabled;
  const unique = [...new Set(ids)];
  const registered = getRegisteredAdapters();
  const selected: AgentAdapter[] = [];
  for (const id of unique) {
    const adapter = registered.find((candidate) => candidate.id === id);
    if (!adapter) throw new Error(`Unknown agent adapter: ${id}`);
    selected.push(adapter);
  }
  return selected;
}

async function syncBase(
  adapter: AgentAdapter,
  basePath: string,
  scope: 'project' | 'global',
  skills: SkillTarget[],
  mode: LinkMode,
  store: string,
  cwd: string,
  options: SyncOptions,
  actions: SyncAction[]
): Promise<void> {
  for (const skill of skills) {
    const target = resolveAdapterTarget(basePath, skill.name, cwd);
    try {
      const state = await linkManager.targetState(skill.canonicalPath, target);
      if (!options.dryRun) {
        await adapter.ensureTarget(skill.name, target, skill.canonicalPath, mode, {
          relative: scope === 'project',
        });
      }
      actions.push({
        skill: skill.name,
        adapter: adapter.id,
        scope,
        target,
        action: state === 'missing' ? 'created' : state === 'current' ? 'unchanged' : state === 'managed-stale' ? 'updated' : 'failed',
        message: state === 'unmanaged' ? 'Refusing to overwrite unmanaged target' : undefined,
      });
    } catch (err) {
      actions.push({
        skill: skill.name, adapter: adapter.id, scope, target, action: 'failed',
        message: (err as Error).message,
      });
    }
  }

  if (options.prune) await pruneBase(adapter, basePath, scope, skills, store, cwd, options.dryRun, actions);
}

async function pruneBase(
  adapter: AgentAdapter,
  basePath: string,
  scope: 'project' | 'global',
  skills: SkillTarget[],
  store: string,
  cwd: string,
  dryRun: boolean | undefined,
  actions: SyncAction[]
): Promise<void> {
  const base = resolveAdapterTarget(basePath, '', cwd);
  const desired = new Set(skills.map((skill) => skill.name));
  const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith('.') || desired.has(entry.name)) continue;
    const target = resolveAdapterTarget(basePath, entry.name, cwd);
    const inspection = await linkManager.inspectManagedTarget(target, store);
    if (inspection.kind === 'unmanaged' || inspection.kind === 'missing' || !inspection.canonical) {
      actions.push({
        skill: entry.name, adapter: adapter.id, scope, target, action: 'skipped',
        message: 'Prune preserved unmanaged target',
      });
      continue;
    }
    try {
      if (!dryRun) await adapter.removeTarget(entry.name, target, inspection.canonical);
      actions.push({ skill: entry.name, adapter: adapter.id, scope, target, action: 'pruned' });
    } catch (err) {
      actions.push({
        skill: entry.name, adapter: adapter.id, scope, target, action: 'failed',
        message: (err as Error).message,
      });
    }
  }
}

function emptyCounts(): Record<SyncActionKind, number> {
  return { created: 0, updated: 0, unchanged: 0, pruned: 0, skipped: 0, failed: 0 };
}

export { getEnabledAdapters, scanCoexistence } from './index.js';
