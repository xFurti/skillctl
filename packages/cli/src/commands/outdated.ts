import { cliLog } from '../lib/output.js';
import type { Command } from 'commander';
import { loadManifest } from '@skillctl/manifest';
import { loadLockfile } from '@skillctl/lockfile';
import {
  canonicalizeName,
  getGlobalSkillctlRoot,
  getGlobalSkillsStore,
  getProjectSkillsStore,
  requireSkillctlProject,
} from '@skillctl/core';
import { planUpdates } from '@skillctl/registry';
import { handleCommandError } from '../lib/errors.js';

export function registerOutdated(program: Command): void {
  program
    .command('outdated [names...]')
    .description('Check installed skills for available updates')
    .option('--latest', 'check beyond exact npm constraints')
    .option('-g, --global', 'check the global installation')
    .option('--json', 'machine-readable output')
    .action(async (names, options) => {
      try {
        const cwd = options.global ? getGlobalSkillctlRoot() : await requireSkillctlProject();
        const store = options.global ? getGlobalSkillsStore() : getProjectSkillsStore(cwd);
        const [manifest, lock] = await Promise.all([loadManifest(cwd), loadLockfile(cwd)]);
        if (!lock) throw new Error('No lockfile. Run install first.');
        const candidates = await planUpdates(lock, manifest, {
          names: names.map((name: string) => canonicalizeName(name)),
          latest: options.latest,
          store,
        });
        if (options.json) cliLog(JSON.stringify({ scope: options.global ? 'global' : 'project', candidates }, null, 2));
        else printCandidates(candidates);
        if (candidates.some((candidate) => candidate.status !== 'current')) process.exitCode = 1;
      } catch (err) {
        handleCommandError(err, 'outdated');
      }
    });
}

export function printCandidates(candidates: Awaited<ReturnType<typeof planUpdates>>): void {
  if (!candidates.length) {
    cliLog('No skills to check.');
    return;
  }
  for (const candidate of candidates) {
    const versions = candidate.currentVersion && candidate.candidateVersion
      ? ` ${candidate.currentVersion} -> ${candidate.candidateVersion}`
      : '';
    cliLog(`${candidate.name}: ${candidate.status}${versions}${candidate.kind !== 'none' ? ` (${candidate.kind})` : ''}`);
    if (candidate.warning) cliLog(`  ${candidate.warning}`);
  }
}
