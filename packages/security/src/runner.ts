import { loadConfig, resolveEntryCanonicalPath } from '@skillctl/core';
import { loadLockfile } from '@skillctl/lockfile';
import type { AuditReport, AuditFinding } from './types.js';
import { checkIntegrityDrift } from './rules/integrity-drift.js';
import { checkScriptHeuristics } from './rules/script-heuristics.js';
import { checkNameDirMatch } from './rules/name-dir-match.js';
import { checkPathTraversal } from './rules/path-traversal.js';
import { checkSizeLimits } from './rules/size-limits.js';
import { checkAdvancedContent } from './rules/advanced-content.js';

export async function runAudit(cwd = process.cwd(), options?: { store?: string }): Promise<AuditReport> {
  const lock = await loadLockfile(cwd);
  if (!lock || Object.keys(lock.skills).length === 0) {
    return { status: 'ok', findings: [], scanned: 0 };
  }

  const findings: AuditFinding[] = [];
  const config = await loadConfig();
  const trustedSources = config.trustedSources || [];
  const trustedSourcesMode = config.security?.trustedSourcesMode || 'warn';
  findings.push(...(await checkIntegrityDrift(lock, options)));

  for (const [name, entry] of Object.entries(lock.skills)) {
    if (trustedSourcesMode !== 'off' && trustedSources.length && !trustedSources.some((pattern) => matchesSource(pattern, entry.specifier))) {
      findings.push({
        rule: 'source-trust',
        severity: trustedSourcesMode === 'error' ? 'error' : 'warning',
        skill: name,
        message: `Source is not covered by trustedSources: ${entry.specifier}`,
        description: 'Restrict project dependencies to reviewed source patterns.',
        helpUri: 'https://xfurti.github.io/skillctl/#security',
      });
    }
    if (!entry.integrity || !entry.provenance?.type) {
      findings.push({ rule: 'provenance-completeness', severity: 'error', skill: name, message: 'Lock entry is missing integrity or provenance metadata.' });
    }
    if ((entry.provenance.type === 'github' || entry.provenance.type === 'skills.sh') && !entry.provenance.commit) {
      findings.push({ rule: 'mutable-resolution', severity: 'warning', skill: name, message: 'Remote Git source is not pinned to a commit; run skillctl update.' });
    }
    if (entry.provenance.type === 'npm' && (!entry.provenance.version || !entry.provenance.tarballHash)) {
      findings.push({ rule: 'mutable-resolution', severity: 'warning', skill: name, message: 'npm source lacks an exact version or tarball integrity; run skillctl update.' });
    }
    const canonicalPath = await resolveEntryCanonicalPath(entry, options);
    findings.push(...(await checkNameDirMatch(name, canonicalPath)));
    findings.push(...(await checkScriptHeuristics(name, canonicalPath)));
    findings.push(...(await checkPathTraversal(name, canonicalPath)));
    findings.push(...(await checkSizeLimits(name, canonicalPath)));
    findings.push(...(await checkAdvancedContent(name, canonicalPath)));
  }

  const hasError = findings.some((f) => f.severity === 'error');
  const hasWarning = findings.some((f) => f.severity === 'warning');

  return {
    status: hasError ? 'errors' : hasWarning ? 'warnings' : 'ok',
    findings,
    scanned: Object.keys(lock.skills).length,
  };
}

function matchesSource(pattern: string, source: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(source);
}

export function auditExitCode(report: AuditReport, strict = false): number {
  if (report.status === 'errors') return 2;
  if (strict && report.status === 'warnings') return 2;
  if (report.status === 'warnings') return 1;
  return 0;
}
