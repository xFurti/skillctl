import type { Command } from 'commander';
import {
  canonicalizeName,
  getGlobalSkillctlRoot,
  getGlobalSkillsStore,
  getProjectSkillsStore,
  purgeCanonical,
  resolveAdapterTarget,
  resolveEntryCanonicalPath,
  type LockfileEntry,
  requireSkillctlProject,
} from '@skillctl/core';
import { getEnabledAdapters } from '@skillctl/adapters';
import { updateProjectState, withOperationLocks } from '@skillctl/project-state';
import { handleCommandError } from '../lib/errors.js';

export function registerRemove(program: Command): void {
  program
    .command('remove <name>')
    .alias('rm')
    .description('Remove skill from manifest/lock and unlink agent targets')
    .option('--json', 'machine-readable output')
    .option('-g, --global', 'remove from the global skill store')
    .option('--purge', 'also remove installed skill contents')
    .action(async (name, options) => {
      try {
        const cwd = options.global ? getGlobalSkillctlRoot() : await requireSkillctlProject();
        const store = options.global ? getGlobalSkillsStore() : getProjectSkillsStore(cwd);
        const canonicalName = canonicalizeName(name);
        await withOperationLocks({ cwd, store }, async () => {
          let removedEntry: LockfileEntry | undefined;
          let changed = false;
          await updateProjectState(cwd, async (state) => {
            const manifest = state.manifest;
            const lock = state.lockfile;
            if (manifest?.agentSkills?.dependencies?.[canonicalName]) {
              delete manifest.agentSkills.dependencies[canonicalName];
              changed = true;
            }
            if (manifest?.agentSkills?.devDependencies?.[canonicalName]) {
              delete manifest.agentSkills.devDependencies[canonicalName];
              changed = true;
            }
            if (lock?.skills[canonicalName]) {
              removedEntry = lock.skills[canonicalName];
              delete lock.skills[canonicalName];
              changed = true;
            }
            return { state: { manifest, lockfile: lock }, result: undefined };
          });

          if (removedEntry) {
            const canonicalPath = await resolveEntryCanonicalPath(removedEntry, { store });
            for (const adapter of await getEnabledAdapters()) {
              const paths = options.global ? adapter.globalPaths : [...adapter.projectPaths, ...adapter.globalPaths];
              for (const path of paths) {
                const target = resolveAdapterTarget(path, canonicalName, cwd);
                await adapter.removeTarget(canonicalName, target, canonicalPath).catch((err) => {
                  console.warn(`Skipped unsafe target ${target}: ${(err as Error).message}`);
                });
              }
            }
          }
          if (options.purge || options.global) await purgeCanonical(canonicalName, { store });
          if (!changed && !options.purge) console.log(`No entry for ${name} found.`);
          else console.log(`Removed ${canonicalName}.`);
        });
      } catch (err) {
        handleCommandError(err, 'remove');
      }
    });
}
