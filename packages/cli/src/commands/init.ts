import { cliLog, cliError } from '../lib/output.js';
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
  cliLog(`Adding skillctl meta-skill from ${spec}...`);
  await registry.add(spec, { cwd, updateManifest: true });
  if (sync) {
    const lock = (await loadLockfile(cwd)) || createEmptyLockfile();
    const skills = await lockToSkillTargets(lock, { store: getProjectSkillsStore(cwd) });
    const res = await syncSkillsToAgents(skills);
    cliLog(`Synced ${res.synced} agent target(s).`);
    if (res.notes.length) cliLog('Notes:', res.notes.join('; '));
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
        cliLog('agent-skills.json already exists');
        return;
      }
      cliLog('Created agent-skills.json');
      cliLog('Created .skillctl/skills');

      const registry = mgr || new RegistryManager();

      if (options.withSkill) {
        const shouldAdd = options.noPrompt
          ? true
          : await confirm('Add the skillctl meta-skill to this project?', true);
        if (shouldAdd) {
          try {
            await addMetaSkill(cwd, registry, true);
          } catch (err) {
            cliError(`Meta-skill add failed: ${(err as Error).message}`);
            cliLog('You can retry with: skillctl add github:xFurti/skillctl#skills/skillctl');
          }
        }
      }

      if (options.noPrompt) {
        if (!options.withSkill) {
          cliLog('Run `skillctl add <spec>` or `skillctl import` to populate, then `install` or `sync`.');
        }
        return;
      }

      const { deduped, sources } = await discoverProjectSkills({ cwd });
      const unmanaged = deduped.length;
      if (!unmanaged || !sources.length) {
        if (!options.withSkill) {
          cliLog('Run `skillctl add <spec>` to populate, then `install` or `sync`.');
        }
        return;
      }

      cliLog(`Found ${unmanaged} existing skill(s) in agent directories (${sources.map((s) => s.projectPath).join(', ')}).`);
      const shouldImport = await confirm('Import them into skillctl now?', true);
      if (!shouldImport) {
        cliLog('Run `skillctl import` when ready.');
        return;
      }

      const result = await executeImport({ source: 'project', cwd, sync: true });
      cliLog(`Imported: ${result.imported.join(', ') || '(none)'}`);
      if (result.errors.length) {
        cliError('Import errors:', result.errors.join('; '));
      }
      if (!result.imported.length) {
        cliLog('Run `skillctl add <spec>` to populate, then `install` or `sync`.');
      }
    });
}
