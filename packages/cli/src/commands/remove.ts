import type { Command } from 'commander';
import { loadManifest, saveManifest } from '@skillctl/manifest';
import { loadLockfile, saveLockfile } from '@skillctl/lockfile';
import {
  canonicalizeName,
  purgeCanonical,
  resolveAdapterTarget,
  resolveEntryCanonicalPath,
} from '@skillctl/core';
import { getEnabledAdapters } from '@skillctl/adapters';
import { handleCommandError } from '../lib/errors.js';

export function registerRemove(program: Command): void {
  program
    .command('remove <name>')
    .alias('rm')
    .description('Remove skill from manifest/lock and unlink agent targets')
    .option('--purge', 'also remove from canonical ~/.skillctl/skills/<name>')
    .action(async (name, options) => {
      try {
        const cwd = process.cwd();
        let manifest = await loadManifest(cwd);
        let lock = await loadLockfile(cwd);
        const canonicalName = canonicalizeName(name);
        let changed = false;

        if (manifest?.agentSkills?.dependencies?.[canonicalName]) {
          delete manifest.agentSkills.dependencies[canonicalName];
          await saveManifest(manifest, cwd);
          changed = true;
          console.log(`Removed ${canonicalName} from manifest.`);
        }
        if (manifest?.agentSkills?.devDependencies?.[canonicalName]) {
          delete manifest.agentSkills.devDependencies[canonicalName];
          await saveManifest(manifest, cwd);
          changed = true;
          console.log(`Removed ${canonicalName} from manifest devDependencies.`);
        }

        if (lock?.skills?.[canonicalName]) {
          const entry = lock.skills[canonicalName];
          const canonicalPath = await resolveEntryCanonicalPath(entry);
          delete lock.skills[canonicalName];
          await saveLockfile(lock, cwd);
          changed = true;
          console.log(`Removed ${canonicalName} from lock (was at ${entry.canonicalPath}).`);

          const adapters = await getEnabledAdapters();
          for (const ad of adapters) {
            for (const p of [...ad.projectPaths, ...ad.globalPaths]) {
              const target = resolveAdapterTarget(p, canonicalName, cwd);
              await ad.removeTarget(canonicalName, target, canonicalPath).catch((err) => {
                console.warn(`Skipped unsafe target ${target}: ${(err as Error).message}`);
              });
            }
          }
        }

        if (options.purge) {
          await purgeCanonical(canonicalName);
          console.log('Purged canonical dir.');
        }

        if (!changed) console.log(`No entry for ${name} found.`);
        else console.log('Done. Run `sync` if needed.');
      } catch (err) {
        handleCommandError(err, 'remove');
      }
    });
}
