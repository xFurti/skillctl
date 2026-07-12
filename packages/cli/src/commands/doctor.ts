import type { Command } from 'commander';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  findLockReproducibilityWarnings,
  findPortablePathWarnings,
  getGlobalSkillctlRoot,
  getGlobalSkillsStore,
  getProjectSkillsStore,
  getRegisteredAdapters,
  loadConfig,
  lockToSkillTargets,
  requireSkillctlProject,
} from '@skillctl/core';
import { loadManifest } from '@skillctl/manifest';
import { loadLockfile } from '@skillctl/lockfile';
import { scanCoexistence, getEnabledAdapters, syncSkillsToAgents } from '@skillctl/adapters';
import { runAudit, auditExitCode } from '@skillctl/security';
import { withOperationLocks } from '@skillctl/project-state';

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose environment, links, config, coexistence')
    .option('--json', 'output JSON')
    .option('--fix', 're-sync agent links from lock')
    .option('-g, --global', 'diagnose the global skill installation')
    .action(async (options) => {
      const cwd = options.global ? getGlobalSkillctlRoot() : await requireSkillctlProject();
      const store = options.global ? getGlobalSkillsStore() : getProjectSkillsStore(cwd);
      const [config, manifest, lock, coexist, enabledAdapters, audit] = await Promise.all([
        loadConfig(),
        loadManifest(cwd),
        loadLockfile(cwd),
        options.global ? Promise.resolve({ detected: false, details: [], paths: [], recommendations: [] }) : scanCoexistence(cwd),
        getEnabledAdapters(),
        runAudit(cwd, { store }),
      ]);

      const issues: string[] = [];
      const warnings: string[] = [];
      const info: string[] = [];

      if (!manifest && !options.global) issues.push('No agent-skills.json in project');
      if (!lock) info.push('No agent-skills.lock yet (run install after adding skills)');
      if (coexist.detected) info.push('Coexistence markers detected');

      if (lock) {
        warnings.push(...findPortablePathWarnings(lock, manifest));
        warnings.push(...findLockReproducibilityWarnings(lock));
      }
      warnings.push(...await findStateWarnings(cwd, store));

      for (const f of audit.findings.filter((x) => x.severity === 'error')) {
        issues.push(`[audit] ${f.skill}: ${f.message}`);
      }

      if (options.fix && lock) {
        const res = await withOperationLocks(
          { cwd, store },
          async () => syncSkillsToAgents(await lockToSkillTargets(lock, { store }), {
            scope: options.global ? 'global' : 'both',
          })
        );
        info.push(`--fix: re-synced ${res.synced} targets`);
      }

      const report = {
        status: issues.length
          ? 'issues'
          : warnings.length || audit.status === 'warnings'
            ? 'warnings'
            : 'ok',
        config: { store, defaultMode: config.defaultMode },
        manifestPresent: !!manifest,
        lockPresent: !!lock,
        issues,
        warnings,
        info,
        adapters: {
          registered: getRegisteredAdapters().map((a) => a.id),
          enabled: enabledAdapters.map((a) => a.id),
        },
        coexistence: coexist,
        auditSummary: { scanned: audit.scanned, findings: audit.findings.length },
      };

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = issues.length ? 2 : auditExitCode(audit);
        return;
      }

      console.log('skillctl doctor');
      console.log('Config store:', report.config.store);
      console.log('Manifest:', report.manifestPresent ? 'present' : 'missing');
      console.log('Lockfile:', report.lockPresent ? 'present' : 'missing');
      console.log('Adapters enabled:', report.adapters.enabled.join(', ') || '(none)');
      if (coexist.detected) {
        console.log('Coexistence:', coexist.details.join('; '));
        if (coexist.recommendations.length) console.log('Recommendations:', coexist.recommendations.join('; '));
      }
      if (audit.findings.length) {
        console.log(`Audit: ${audit.findings.length} finding(s) across ${audit.scanned} skill(s)`);
      }
      if (issues.length) console.log('Issues:', issues.join('; '));
      if (warnings.length) console.log('Warnings:', warnings.join('; '));
      if (info.length) console.log('Info:', info.join('; '));

      process.exitCode = issues.length ? 2 : warnings.length ? 1 : auditExitCode(audit);
    });
}

async function findStateWarnings(cwd: string, store: string): Promise<string[]> {
  const warnings: string[] = [];
  if (await exists(join(cwd, '.skillctl-transaction.json'))) {
    warnings.push('transaction-journal: interrupted project update detected; the next mutating command will recover it');
  }
  for (const path of [join(cwd, '.skillctl-operation.lock'), join(store, '.skillctl-store.lock')]) {
    const value = await stat(path).catch(() => null);
    if (value && Date.now() - value.mtimeMs > 30_000) warnings.push(`stale-lock: ${path}`);
  }
  return warnings;
}

async function exists(path: string): Promise<boolean> {
  return !!await stat(path).catch(() => null);
}
