import type { Command } from 'commander';
import { RegistryManager } from '@skillctl/registry';
import { syncSkillsToAgents } from '@skillctl/adapters';
import { getGlobalSkillsStore, resolveEntryCanonicalPath } from '@skillctl/core';
import { handleCommandError } from '../lib/errors.js';

export function registerAdd(program: Command, mgr?: RegistryManager): void {
  program
    .command('add <spec>')
    .description('Add a skill from github, npm, local, skills.sh (registry + cache)')
    .option('--json', 'machine-readable output')
    .option('-g, --global', 'install into the global skill store')
    .option('--no-manifest', 'do not update agent-skills.json')
    .action(async (spec, options) => {
      try {
        const registry = mgr || new RegistryManager();
        console.log(`Resolving ${spec} via registry...`);
        const entry = await registry.add(spec, {
          global: options.global,
          updateManifest: options.global ? false : options.manifest !== false,
        });
        console.log(`Added ${entry.name}`);
        console.log(`  resolved: ${entry.resolved}`);
        console.log(`  integrity: ${entry.integrity}`);
        console.log(`  canonical: ${entry.canonicalPath}`);
        if (options.global) {
          const result = await syncSkillsToAgents(
            [{ name: entry.name, canonicalPath: await resolveEntryCanonicalPath(entry, { store: getGlobalSkillsStore() }) }],
            { scope: 'global' }
          );
          console.log(`  synced: ${result.synced} global agent target(s)`);
        }
      } catch (err) {
        handleCommandError(err, 'add');
      }
    });
}
