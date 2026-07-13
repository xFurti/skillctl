import type { Command } from 'commander';
import { loadManifest } from '@skillctl/manifest';
import { loadLockfile } from '@skillctl/lockfile';
import { getGlobalSkillctlRoot, requireSkillctlProject } from '@skillctl/core';

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List installed skills from lockfile (and manifest)')
    .option('--json', 'output JSON')
    .option('-g, --global', 'list globally installed skills')
    .action(async (options) => {
      const cwd = options.global ? getGlobalSkillctlRoot() : await requireSkillctlProject();
      const manifest = await loadManifest(cwd);
      const lock = await loadLockfile(cwd);
      const skills = lock ? Object.keys(lock.skills) : [];

      if (options.json) {
        console.log(JSON.stringify({ manifest: manifest ?? null, lock: lock ?? null, skills }, null, 2));
        return;
      }

      console.log('skillctl list');
      if (manifest) {
        console.log('Manifest deps:', Object.keys(manifest.agentSkills?.dependencies || {}).length);
      } else {
        console.log('No agent-skills.json (run `skillctl init`)');
      }
      console.log('Skills in lock:', skills.length ? skills.join(', ') : '(none)');
    });
}
