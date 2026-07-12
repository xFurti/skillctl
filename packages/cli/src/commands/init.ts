import type { Command } from 'commander';
import { mkdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createDefaultManifest } from '@skillctl/manifest';
import { loadLockfile, createEmptyLockfile } from '@skillctl/lockfile';
import { discoverProjectSkills, executeImport } from '@skillctl/import';
import { getProjectSkillsStore, lockToSkillTargets } from '@skillctl/core';
import { RegistryManager } from '@skillctl/registry';
import { syncSkillsToAgents } from '@skillctl/adapters';
import { confirm } from '../lib/prompt.js';
import { updateProjectState, withOperationLocks } from '@skillctl/project-state';

const META_SKILL_REMOTE = 'github:xFurti/skillctl#skills/skillctl';
const META_SKILL_LOCAL = 'file:./skills/skillctl';

async function resolveMetaSkillSpecifier(cwd: string): Promise<string> {
  try {
    await stat(join(cwd, 'skills', 'skillctl', 'SKILL.md'));
    return META_SKILL_LOCAL;
  } catch {
    return META_SKILL_REMOTE;
  }
}

async function addMetaSkill(cwd: string, registry: RegistryManager, sync: boolean): Promise<void> {
  const spec = await resolveMetaSkillSpecifier(cwd);
  console.log(`Adding skillctl meta-skill from ${spec}...`);
  await registry.add(spec, { cwd, updateManifest: true });
  if (sync) {
    const lock = (await loadLockfile(cwd)) || createEmptyLockfile();
    const skills = await lockToSkillTargets(lock, { store: getProjectSkillsStore(cwd) });
    const res = await syncSkillsToAgents(skills);
    console.log(`Synced ${res.synced} agent target(s).`);
    if (res.notes.length) console.log('Notes:', res.notes.join('; '));
  }
}

export function registerInit(program: Command, mgr?: RegistryManager): void {
  program
    .command('init')
    .description('Initialize agent-skills.json in current project')
    .option('--json', 'machine-readable output')
    .option('--no-prompt', 'skip post-init import wizard')
    .option('--with-skill', 'add the skillctl meta-skill and sync to agents')
    .action(async (options) => {
      const cwd = process.cwd();
      const store = getProjectSkillsStore(cwd);
      const sample = createDefaultManifest(basename(cwd));
      const created = await withOperationLocks({ cwd, store }, async () =>
        updateProjectState(cwd, async (state) => {
          if (state.manifest) return { state, result: false };
          return { state: { ...state, manifest: sample }, result: true };
        })
      );
      await mkdir(join(cwd, '.skillctl', 'skills'), { recursive: true });
      if (!created) {
        console.log('agent-skills.json already exists');
        return;
      }
      console.log('Created agent-skills.json');
      console.log('Created .skillctl/skills');

      const registry = mgr || new RegistryManager();

      if (options.withSkill) {
        const shouldAdd = options.noPrompt
          ? true
          : await confirm('Add the skillctl meta-skill to this project?', true);
        if (shouldAdd) {
          try {
            await addMetaSkill(cwd, registry, true);
          } catch (err) {
            console.error(`Meta-skill add failed: ${(err as Error).message}`);
            console.log('You can retry with: skillctl add github:xFurti/skillctl#skills/skillctl');
          }
        }
      }

      if (options.noPrompt) {
        if (!options.withSkill) {
          console.log('Run `skillctl add <spec>` or `skillctl import from-project` to populate, then `install` or `sync`.');
        }
        return;
      }

      const { deduped, sources } = await discoverProjectSkills({ cwd });
      const unmanaged = deduped.length;
      if (!unmanaged || !sources.length) {
        if (!options.withSkill) {
          console.log('Run `skillctl add <spec>` to populate, then `install` or `sync`.');
        }
        return;
      }

      console.log(`Found ${unmanaged} existing skill(s) in agent directories (${sources.map((s) => s.projectPath).join(', ')}).`);
      const shouldImport = await confirm('Import them into skillctl now?', true);
      if (!shouldImport) {
        console.log('Run `skillctl import from-project` when ready.');
        return;
      }

      const result = await executeImport({ source: 'project', cwd, sync: true });
      console.log(`Imported: ${result.imported.join(', ') || '(none)'}`);
      if (result.errors.length) {
        console.error('Import errors:', result.errors.join('; '));
      }
      if (!result.imported.length) {
        console.log('Run `skillctl add <spec>` to populate, then `install` or `sync`.');
      }
    });
}
