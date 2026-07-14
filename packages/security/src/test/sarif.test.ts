import test from 'node:test';
import assert from 'node:assert/strict';
import { auditReportToSarif } from '../sarif.js';

test('converts audit findings to stable SARIF 2.1.0', () => {
  const sarif = auditReportToSarif({
    status: 'warnings', scanned: 1,
    findings: [{ rule: 'source-trust', severity: 'warning', skill: 'demo', message: 'Untrusted', path: 'demo/SKILL.md' }],
  }) as any;
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].results[0].level, 'warning');
  assert.match(sarif.runs[0].results[0].partialFingerprints.primaryLocationLineHash, /^[0-9a-f]{64}$/);
});
