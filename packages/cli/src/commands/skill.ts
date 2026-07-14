import { cliLog } from '../lib/output.js';
import type { Command } from 'commander';
import { resolve } from 'node:path';
import { validateSkillDir, auditExitCode } from '@skillctl/security';
import { handleCommandError } from '../lib/errors.js';

export function registerSkill(program: Command): void {
  const skillCmd = program.command('skill').description('Utilities for Agent Skill directories');

  skillCmd
    .command('validate [path]')
    .description('Validate a SKILL.md directory (frontmatter, scripts, size)')
    .option('--json', 'machine-readable output')
    .option('--strict', 'treat warnings as errors (exit 2)')
    .action(async (pathArg, options) => {
      try {
        const skillPath = resolve(process.cwd(), pathArg || 'skills/skillctl');
        const report = await validateSkillDir(skillPath);

        if (options.json) {
          cliLog(JSON.stringify({ ...report, path: skillPath }, null, 2));
          process.exitCode = auditExitCode(report, options.strict);
          return;
        }

        cliLog(`skillctl skill validate — ${skillPath}`);
        cliLog(`Status: ${report.status} (scanned ${report.scanned})`);
        for (const f of report.findings) {
          cliLog(`  [${f.severity}] ${f.rule}: ${f.message}`);
        }
        if (report.findings.length === 0) cliLog('  No issues found.');

        process.exitCode = auditExitCode(report, options.strict);
      } catch (err) {
        handleCommandError(err, 'skill validate');
      }
    });
}