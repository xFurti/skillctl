import test from 'node:test';
import assert from 'node:assert/strict';
import { auditExitCode } from '../runner.js';

test('audit policy findings use domain exit 1 while fatal findings use exit 2', () => {
  assert.equal(auditExitCode({ status: 'ok', findings: [], scanned: 1 }, true), 0);
  assert.equal(auditExitCode({ status: 'warnings', findings: [], scanned: 1 }, false), 1);
  assert.equal(auditExitCode({ status: 'warnings', findings: [], scanned: 1 }, true), 1);
  assert.equal(auditExitCode({ status: 'errors', findings: [], scanned: 1 }, false), 2);
});
