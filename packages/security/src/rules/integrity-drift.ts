import { stat } from 'node:fs/promises';
import type { SkillLockfile } from '@skillctl/core';
import { computeDirIntegrity, resolveEntryCanonicalPath } from '@skillctl/core';
import type { AuditFinding } from '../types.js';

export async function checkIntegrityDrift(lock: SkillLockfile, options?: { store?: string }): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  for (const [name, entry] of Object.entries(lock.skills)) {
    const path = await resolveEntryCanonicalPath(entry, options);
    try {
      await stat(path);
      const integrity = await computeDirIntegrity(path);
      if (integrity !== entry.integrity) {
        findings.push({
          rule: 'integrity-drift',
          severity: 'error',
          skill: name,
          message: `Canonical integrity mismatch (lock: ${entry.integrity.slice(0, 24)}...)`,
          path,
        });
      }
    } catch {
      findings.push({
        rule: 'integrity-drift',
        severity: 'error',
        skill: name,
        message: 'Canonical path missing',
        path,
      });
    }
  }
  return findings;
}
