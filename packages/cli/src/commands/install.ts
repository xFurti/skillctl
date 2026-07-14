import { cliLog, cliError } from '../lib/output.js';
import type { Command } from 'commander';
import { stat } from 'node:fs/promises';
import { loadManifest } from '@skillctl/manifest';
import { loadLockfile, createEmptyLockfile } from '@skillctl/lockfile';
import {
  lockToSkillTargets,
  needsInstall,
  resolveEntryCanonicalPath,
  getProjectSkillsStore,
  requireSkillctlProject,
  type LockfileEntry,
} from '@skillctl/core';
import { RegistryManager } from '@skillctl/registry';
import { syncSkillsToAgents } from '@skillctl/adapters';
import { handleCommandError } from '../lib/errors.js';
import { withOperationLocks } from '@skillctl/project-state';

export interface InstallSummary {
  installed: string[];
  reused: string[];
  repaired: string[];
  skippedDev: string[];
  warnings: string[];
}

export function registerInstall(program: Command, mgr?: RegistryManager): void {
  program
    .command('install')
    .alias('i')
    .description('Install/ensure all skills from agent-skills.json into canonical store')
    .option('--json', 'machine-readable output')
    .option('--no-sync', 'skip linking to agents after install')
    .option('--frozen', 'install exactly from lock without modifying it')
    .option('--prod', 'exclude devDependencies')
    .action(async (options) => {
      try {
        const cwd = await requireSkillctlProject();
        const store = getProjectSkillsStore(cwd);
        const manifest = await loadManifest(cwd);
        let lock = (await loadLockfile(cwd)) || createEmptyLockfile();
        const registry = mgr || new RegistryManager();
        if (!manifest) throw new Error('agent-skills.json not found. Run `skillctl init` first.');

        const production = manifest.agentSkills?.dependencies || {};
        const development = manifest.agentSkills?.devDependencies || {};
        const deps = options.prod ? production : { ...development, ...production };
        const summary: InstallSummary = {
          installed: [],
          reused: [],
          repaired: [],
          skippedDev: options.prod ? Object.keys(development) : [],
          warnings: [],
        };

        const frozenErrors: string[] = [];
        if (options.frozen) {
          for (const [name, spec] of Object.entries(deps)) {
            const entry = lock.skills[name];
            if (!entry) frozenErrors.push(`${name}: missing from lockfile`);
            else if (entry.specifier !== spec) frozenErrors.push(`${name}: manifest specifier differs from lockfile`);
            else if (!isImmutableLockEntry(entry)) frozenErrors.push(`${name}: lock resolution is mutable or legacy`);
          }
          if (frozenErrors.length) {
            cliError('Frozen install failed:');
            frozenErrors.forEach((error) => cliError(' -', error));
            process.exitCode = 2;
            return;
          }
        }

        for (const [name, spec] of Object.entries(deps)) {
          let entry = lock.skills[name];
          const lockMatches = entry?.specifier === spec;

          if (!entry || !lockMatches || !isImmutableLockEntry(entry)) {
            if (options.frozen) continue;
            cliLog(`Resolving ${name} from ${spec}...`);
            entry = await registry.add(spec, { cwd, updateManifest: false, name });
            lock = (await loadLockfile(cwd)) || lock;
            summary.installed.push(name);
            continue;
          }

          if (!(await needsInstall(entry, { store }))) {
            cliLog(`Using locked ${name}`);
            summary.reused.push(name);
            continue;
          }

          const canonicalPath = await resolveEntryCanonicalPath(entry, { store });
          const existed = await stat(canonicalPath).then(() => true, () => false);
          cliLog(`${existed ? 'Repairing' : 'Installing'} ${name} from locked resolution...`);
          await registry.installLockedEntry(entry, { cwd, store, name, expectedIntegrity: entry.integrity });
          (existed ? summary.repaired : summary.installed).push(name);
        }

        cliLog(
          `Install complete. ${summary.installed.length} installed, ${summary.repaired.length} repaired, ${summary.reused.length} reused.`
        );

        if (options.sync !== false) {
          let skills = await lockToSkillTargets(lock, { store });
          if (options.prod) {
            const allowed = new Set(Object.keys(production));
            skills = skills.filter((skill) => allowed.has(skill.name));
          }
          const result = await withOperationLocks({ cwd, store }, () => syncSkillsToAgents(skills));
          cliLog(`Synced ${result.synced} links via adapters: ${result.adaptersUsed.join(', ') || 'none'}`);
          if (result.notes.length) cliLog('Notes:', result.notes.join('; '));
        }
      } catch (err) {
        handleCommandError(err, 'install');
      }
    });
}

function isImmutableLockEntry(entry: LockfileEntry): boolean {
  if (entry.provenance.type === 'github' || entry.provenance.type === 'skills.sh') {
    return Boolean(entry.provenance.commit && /^[0-9a-f]{40}$/i.test(entry.provenance.commit));
  }
  if (entry.provenance.type === 'npm') {
    return Boolean(entry.provenance.version && entry.provenance.tarballUrl && entry.provenance.tarballHash);
  }
  return true;
}
