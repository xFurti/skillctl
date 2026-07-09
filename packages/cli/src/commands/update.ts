import type { Command } from 'commander';
import { loadManifest } from '@skillctl/manifest';
import { loadLockfile } from '@skillctl/lockfile';
import { lockToSkillTargets, canonicalizeName } from '@skillctl/core';
import { RegistryManager } from '@skillctl/registry';
import { syncSkillsToAgents } from '@skillctl/adapters';
import { handleCommandError } from '../lib/errors.js';

export function registerUpdate(program: Command, mgr?: RegistryManager): void {
  program
    .command('update [names...]')
    .description('Re-fetch and update skills from their specifiers')
    .option('--no-sync', 'skip agent sync after update')
    .action(async (names, options) => {
      try {
        const cwd = process.cwd();
        const manifest = await loadManifest(cwd);
        const lock = await loadLockfile(cwd);
        if (!lock) {
          console.log('No lockfile. Run install first.');
          return;
        }

        const registry = mgr || new RegistryManager();
        const deps = {
          ...(manifest?.agentSkills?.devDependencies || {}),
          ...(manifest?.agentSkills?.dependencies || {}),
        };
        const toUpdate = names.length
          ? names.map((n: string) => canonicalizeName(n))
          : Object.keys(lock.skills);

        let updated = 0;
        for (const name of toUpdate) {
          const spec = deps[name] || lock.skills[name]?.specifier;
          if (!spec) {
            console.log(`Skip ${name}: no specifier`);
            continue;
          }
          console.log(`Updating ${name} from ${spec}...`);
          await registry.add(spec, { cwd, updateManifest: false, name });
          updated++;
        }

        console.log(`Updated ${updated} skill(s).`);
        if (options.sync !== false) {
          const freshLock = (await loadLockfile(cwd)) || lock;
          const res = await syncSkillsToAgents(await lockToSkillTargets(freshLock));
          console.log(`Synced ${res.synced} links.`);
        }
      } catch (err) {
        handleCommandError(err, 'update');
      }
    });
}
