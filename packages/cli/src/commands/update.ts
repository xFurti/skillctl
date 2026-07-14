import { cliLog } from '../lib/output.js';
import type { Command } from 'commander';
import * as prompts from '@clack/prompts';
import { loadManifest } from '@skillctl/manifest';
import { loadLockfile } from '@skillctl/lockfile';
import { canonicalizeName, getProjectSkillsStore, lockToSkillTargets, requireSkillctlProject } from '@skillctl/core';
import { planUpdates, RegistryManager } from '@skillctl/registry';
import { syncSkillsToAgents } from '@skillctl/adapters';
import { withOperationLocks } from '@skillctl/project-state';
import { SkillctlError, handleCommandError } from '../lib/errors.js';
import { printCandidates } from './outdated.js';
import { createUpdateSnapshot, disposeUpdateSnapshot, restoreUpdateSnapshot } from '../lib/update-snapshot.js';

export function registerUpdate(program: Command, manager = new RegistryManager()): void {
  program
    .command('update [names...]')
    .description('Plan and update skills from their declared specifiers')
    .option('--dry-run', 'show the update plan without writing')
    .option('--latest', 'allow npm updates beyond the declared constraint')
    .option('--save', 'save exact npm versions selected by --latest')
    .option('-y, --yes', 'confirm non-interactive latest updates')
    .option('--json', 'machine-readable output')
    .option('--no-sync', 'skip agent sync after update')
    .action(async (names, options) => {
      try {
        if (options.save && !options.latest) throw new SkillctlError('--save requires --latest', 'INVALID_OPTIONS', 2);
        const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !options.json);
        if (options.latest && !interactive && (!options.save || !options.yes) && !options.dryRun) {
          throw new SkillctlError('Non-interactive --latest requires --save --yes', 'CONFIRMATION_REQUIRED', 2);
        }
        const cwd = await requireSkillctlProject();
        const store = getProjectSkillsStore(cwd);
        const [manifest, lock] = await Promise.all([loadManifest(cwd), loadLockfile(cwd)]);
        if (!lock) throw new Error('No lockfile. Run install first.');
        const normalizedNames = names.map((name: string) => canonicalizeName(name));
        const candidates = await planUpdates(lock, manifest, { names: normalizedNames, latest: options.latest, store, manager });
        const actionable = candidates.filter((candidate) => ['outdated', 'modified', 'legacy'].includes(candidate.status));

        if (options.dryRun) {
          if (options.json) cliLog(JSON.stringify({ dryRun: true, candidates }, null, 2));
          else printCandidates(candidates);
          if (candidates.some((candidate) => candidate.status === 'unavailable')) process.exitCode = 1;
          return;
        }
        if (!actionable.length) {
          if (options.json) cliLog(JSON.stringify({ dryRun: false, candidates, updated: [], sync: null }, null, 2));
          else cliLog('All selected skills are current.');
          return;
        }
        if (candidates.some((candidate) => candidate.status === 'unavailable')) {
          throw new Error('Update plan contains unavailable sources; no changes were applied.');
        }
        if (options.latest && interactive && !options.yes) {
          printCandidates(actionable);
          const confirmed = await prompts.confirm({ message: 'Apply this update plan and save exact npm versions?' });
          if (prompts.isCancel(confirmed) || !confirmed) return;
        }

        const snapshot = await createUpdateSnapshot(cwd, store, actionable.map((candidate) => candidate.name));
        try {
          for (const candidate of actionable) {
            const specifier = candidate.manifestChange?.after || candidate.specifier;
            await manager.add(specifier, {
              cwd,
              updateManifest: Boolean(candidate.manifestChange),
              name: candidate.name,
            });
          }
          await disposeUpdateSnapshot(snapshot);
        } catch (err) {
          await restoreUpdateSnapshot(snapshot);
          throw new Error(`Update failed and project state was restored: ${(err as Error).message}`, { cause: err });
        }
        if (!options.json) cliLog(`Updated ${actionable.length} skill(s).`);
        let syncResult: Awaited<ReturnType<typeof syncSkillsToAgents>> | null = null;
        if (options.sync !== false) {
          const freshLock = (await loadLockfile(cwd)) || lock;
          syncResult = await withOperationLocks(
            { cwd, store },
            async () => syncSkillsToAgents(await lockToSkillTargets(freshLock, { store }), { cwd }),
          );
          if (!options.json) cliLog(`Synced ${syncResult.synced} targets.`);
        }
        if (options.json) cliLog(JSON.stringify({
          dryRun: false,
          candidates,
          updated: actionable.map((candidate) => candidate.name),
          sync: syncResult,
        }, null, 2));
      } catch (err) {
        handleCommandError(err, 'update');
      }
    });
}
