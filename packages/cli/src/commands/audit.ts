import type { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import { auditReportToSarif, runAudit, auditExitCode } from '@skillctl/security';
import type { AuditFinding } from '@skillctl/security';
import { getProjectSkillsStore, requireSkillctlProject, resolveEntryCanonicalPath } from '@skillctl/core';
import { loadLockfile } from '@skillctl/lockfile';
import { getPluginAuditRules } from '@skillctl/plugin-system';
import { SkillctlError, handleCommandError } from '../lib/errors.js';

export function registerAudit(program: Command): void {
  program
    .command('audit')
    .description('Run the offline security scanner on installed skills')
    .option('--json', 'machine-readable envelope output')
    .option('--format <format>', 'output format: table or sarif', 'table')
    .option('--output <path>', 'write SARIF to a file')
    .option('--strict', 'treat warnings as errors (exit 2)')
    .action(async (options) => {
      try {
        if (!['table', 'sarif'].includes(options.format)) throw new SkillctlError('--format must be table or sarif', 'INVALID_OPTIONS', 2);
        if (options.json && options.format !== 'table') throw new SkillctlError('--json cannot be combined with --format sarif', 'INVALID_OPTIONS', 2);
        if (options.output && options.format !== 'sarif') throw new SkillctlError('--output requires --format sarif', 'INVALID_OPTIONS', 2);
        const cwd = await requireSkillctlProject();
        const report = await runAudit(cwd, { store: getProjectSkillsStore(cwd) });
        await appendPluginFindings(report, cwd);
        if (options.json) console.log(JSON.stringify(report, null, 2));
        else if (options.format === 'sarif') {
          const serialized = `${JSON.stringify(auditReportToSarif(report), null, 2)}\n`;
          if (options.output) {
            await writeFile(options.output, serialized, 'utf8');
            console.log(`Wrote SARIF report to ${options.output}.`);
          } else process.stdout.write(serialized);
        } else {
          console.log(`skillctl audit — scanned ${report.scanned} skill(s), status: ${report.status}`);
          for (const finding of report.findings) console.log(`  [${finding.severity}] ${finding.skill} (${finding.rule}): ${finding.message}`);
          if (!report.findings.length) console.log('  No issues found.');
        }
        process.exitCode = auditExitCode(report, options.strict);
      } catch (err) { handleCommandError(err, 'audit'); }
    });
}

async function appendPluginFindings(
  report: Awaited<ReturnType<typeof runAudit>>,
  cwd: string,
): Promise<void> {
  const rules = getPluginAuditRules();
  if (!rules.length) return;
  const lock = await loadLockfile(cwd);
  if (!lock) return;
  for (const [skill, entry] of Object.entries(lock.skills)) {
    const skillPath = await resolveEntryCanonicalPath(entry, { store: getProjectSkillsStore(cwd) });
    for (const rule of rules) {
      try {
        const findings = await rule.run(skill, skillPath);
        for (const finding of findings) {
          report.findings.push({ ...finding, rule: rule.id, skill } satisfies AuditFinding);
        }
      } catch (err) {
        report.findings.push({
          rule: `plugin:${rule.id}`,
          severity: 'warning',
          skill,
          message: `Plugin audit rule failed: ${(err as Error).message}`,
        });
      }
    }
  }
  report.status = report.findings.some((finding) => finding.severity === 'error')
    ? 'errors'
    : report.findings.some((finding) => finding.severity === 'warning') ? 'warnings' : 'ok';
}
