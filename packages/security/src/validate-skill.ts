import { stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { canonicalizeName, parseSkillDirectory } from '@skillctl/core';
import type { AuditFinding, AuditReport } from './types.js';
import { checkNameDirMatch } from './rules/name-dir-match.js';
import { checkScriptHeuristics } from './rules/script-heuristics.js';
import { checkPathTraversal } from './rules/path-traversal.js';
import { checkSizeLimits } from './rules/size-limits.js';
import { checkAdvancedContent } from './rules/advanced-content.js';

async function findSkillMarkdown(skillPath: string): Promise<boolean> {
  for (const f of ['SKILL.md', 'skill.md']) {
    try {
      await stat(join(skillPath, f));
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

/** Validate a single skill directory (SKILL.md layout) without a project lockfile. */
export async function validateSkillDir(skillPath: string): Promise<AuditReport> {
  const abs = resolve(skillPath);
  let dirStat;
  try {
    dirStat = await stat(abs);
  } catch {
    const name = canonicalizeName(basename(abs));
    return {
      status: 'errors',
      scanned: 0,
      findings: [
        {
          rule: 'skill-dir-missing',
          severity: 'error',
          skill: name,
          message: `Skill directory not found: ${abs}`,
          path: abs,
        },
      ],
    };
  }

  if (!dirStat.isDirectory()) {
    const name = canonicalizeName(basename(abs));
    return {
      status: 'errors',
      scanned: 0,
      findings: [
        {
          rule: 'skill-dir-missing',
          severity: 'error',
          skill: name,
          message: 'Path is not a directory',
          path: abs,
        },
      ],
    };
  }

  const name = canonicalizeName(basename(abs));
  const findings: AuditFinding[] = [];

  if (!(await findSkillMarkdown(abs))) {
    findings.push({
      rule: 'skill-md-missing',
      severity: 'error',
      skill: name,
      message: 'SKILL.md (or skill.md) not found',
      path: abs,
    });
    return { status: 'errors', findings, scanned: 0 };
  }

  const parsed = await parseSkillDirectory(abs, { validation: 'collect' }).catch((error) => {
    findings.push({
      rule: 'skill-parse', severity: 'error', skill: name,
      message: (error as Error).message, path: abs,
    });
    return null;
  });
  if (!parsed) return { status: 'errors', findings, scanned: 1 };
  for (const diagnostic of parsed.diagnostics) {
    // A description is recommended metadata, but older valid skills did not
    // require it. Keep parsing it centrally without changing validation status.
    if (diagnostic.code === 'MISSING_DESCRIPTION') continue;
    findings.push({
      rule: diagnostic.code.toLowerCase().replaceAll('_', '-'),
      severity: diagnostic.severity,
      skill: parsed.name,
      message: diagnostic.message,
      path: diagnostic.path,
    });
  }

  findings.push(...(await checkNameDirMatch(name, abs)));
  findings.push(...(await checkScriptHeuristics(name, abs)));
  findings.push(...(await checkPathTraversal(name, abs)));
  findings.push(...(await checkSizeLimits(name, abs)));
  findings.push(...(await checkAdvancedContent(name, abs)));

  const hasError = findings.some((f) => f.severity === 'error');
  const hasWarning = findings.some((f) => f.severity === 'warning');

  return {
    status: hasError ? 'errors' : hasWarning ? 'warnings' : 'ok',
    findings,
    scanned: 1,
  };
}
