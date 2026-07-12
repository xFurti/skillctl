import type { Command } from 'commander';
import { loadLockfile } from '@skillctl/lockfile';
import { getProjectSkillsStore, lockToSkillTargets, requireSkillctlProject } from '@skillctl/core';
import { syncSkillsToAgents, type SyncScope } from '@skillctl/adapters';
import { withOperationLocks } from '@skillctl/project-state';
import { handleCommandError } from '../lib/errors.js';

function collectAgents(value: string, previous: string[]): string[] {
  return [...previous, ...value.split(',').map((id) => id.trim()).filter(Boolean)];
}

export function registerSync(program: Command): void {
  program
    .command('sync')
    .description('Sync canonical skills to enabled agent directories')
    .option('--json', 'machine-readable output')
    .option('--dry-run', 'show what would be done')
    .option('--project', 'sync project-scoped agent directories only')
    .option('--global', 'sync global agent directories only')
    .option('--agent <ids>', 'limit to comma-separated adapter ids (repeatable)', collectAgents, [])
    .option('--prune', 'remove managed targets that are absent from the lockfile')
    .action(async (options) => {
      try {
        if (options.project && options.global) {
          throw new Error('Use either --project or --global; without either flag both scopes are synced.');
        }
        const scope: SyncScope = options.project ? 'project' : options.global ? 'global' : 'both';
        const cwd = await requireSkillctlProject();
        const store = getProjectSkillsStore(cwd);
        const result = await withOperationLocks({ cwd, store }, async () => {
          const lock = await loadLockfile(cwd);
          if (!lock || Object.keys(lock.skills || {}).length === 0) {
            throw new Error('No lockfile or skills to sync. Run install or add first.');
          }
          const skills = await lockToSkillTargets(lock, { store });
          return syncSkillsToAgents(skills, {
            dryRun: options.dryRun,
            scope,
            adapterIds: options.agent,
            prune: options.prune,
          });
        });
        console.log(
          `sync: ${result.counts.created} created, ${result.counts.updated} updated, ` +
          `${result.counts.unchanged} unchanged, ${result.counts.pruned} pruned, ${result.counts.failed} failed`
        );
        if (result.notes.length) console.log('Notes:', result.notes.join(' | '));
        if (options.dryRun) console.log('(dry-run complete; no filesystem changes)');
        if (result.counts.failed) process.exitCode = 1;
      } catch (err) {
        handleCommandError(err, 'sync');
      }
    });
}
