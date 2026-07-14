import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets, StreamingSecretRedactor, writeArtifact } from '../index.js';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('redaction is field-aware and preserves innocuous identifiers', () => {
  const token = 'sk-abcdefghijklmnopqrstuvwxyz';
  const result = redactSecrets({ apiKey: token, integrity: token, version: '1.2.3', note: `Bearer ${token}` });
  assert.equal(result.value.apiKey, '[REDACTED:api-key]');
  assert.equal(result.value.integrity, token);
  assert.equal(result.value.version, '1.2.3');
  assert.doesNotMatch(result.value.note, /sk-/);
  assert.ok(result.redactions.total >= 2);
  assert.equal(JSON.stringify(result.redactions).includes(token), false);
});

test('artifact persistence is versioned, redacted, and path-contained', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-artifact-'));
  try {
    const result = await writeArtifact('test', 'result.json', { token: 'sk-abcdefghijklmnopqrstuvwxyz' }, { cwd });
    assert.equal(result.envelope.schemaVersion, 1);
    assert.match(result.envelope.data.token, /^\[REDACTED:/);
    await assert.rejects(writeArtifact('test', '../escape.json', {}, { cwd }), /escapes/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('artifact persistence is atomic and never replaces an existing report', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-artifact-atomic-'));
  const target = join(cwd, '.skillctl', 'artifacts', 'reports', 'result.json');
  try {
    await writeArtifact('reports', 'result.json', { value: 'first' }, { cwd });
    const original = await readFile(target, 'utf8');
    await assert.rejects(writeArtifact('reports', 'result.json', { value: 'second' }, { cwd }));
    assert.equal(await readFile(target, 'utf8'), original);
    assert.deepEqual((await readdir(join(cwd, '.skillctl', 'artifacts', 'reports'))).filter((name) => name.includes('.tmp-')), []);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('short and common environment values do not cause global false positives', () => {
  const result = redactSecrets('true localhost abc tokenized', { BOOL: 'true', HOST: 'localhost', SHORT: 'abc' });
  assert.equal(result.value, 'true localhost abc tokenized');
  assert.equal(result.redactions.total, 0);
});

test('known secrets are always redacted when concatenated or stored in safe fields', () => {
  const secret = 'known-secret-abcdefghijklmnop';
  const result = redactSecrets({
    text: `prefixABC${secret}XYZsuffix`,
    integrity: `sha256:${secret}`,
    id: secret,
  }, { RELEASE_SECRET: secret });
  assert.doesNotMatch(JSON.stringify(result.value), new RegExp(secret));
  assert.match(result.value.text, /prefixABC\[REDACTED:release-secret\]XYZsuffix/);
  assert.match(result.value.integrity, /^sha256:\[REDACTED:release-secret\]$/);
  assert.equal(result.value.id, '[REDACTED:release-secret]');
});

test('streaming redaction catches a secret split across chunks', () => {
  const redactor = new StreamingSecretRedactor();
  const output = redactor.write('prefix sk-abcdefgh') + redactor.write('ijklmnop suffix') + redactor.end();
  assert.doesNotMatch(output, /sk-abcdefghijklmnop/);
  assert.match(output, /REDACTED:openai-api-key/);
});

test('streaming redaction preserves a token crossing the actual flush frontier', () => {
  const token = 'sk-abcdefghijklmnopqrstuvwxyz';
  const redactor = new StreamingSecretRedactor();
  const prefix = `${'safe-line\n'.repeat(20)}${'x'.repeat(79)} `;
  const first = `${prefix}${token.slice(0, 10)}`;
  const output = redactor.write(first) + redactor.write(`${token.slice(10)}\n${'tail\n'.repeat(30)}`) + redactor.end();
  assert.ok(output.length > 96);
  assert.doesNotMatch(output, new RegExp(token));
  assert.match(output, /REDACTED:openai-api-key/);
});

test('streaming redaction emits bounded segments for long lines without newlines', () => {
  const redactor = new StreamingSecretRedactor();
  const emitted = redactor.write('x'.repeat(16 * 1024));
  assert.ok(emitted.length >= 15 * 1024);
  assert.ok(redactor.end().length <= 96);
});

test('streaming redaction stops an unterminated sensitive block at its limit', () => {
  const redactor = new StreamingSecretRedactor({}, 128);
  assert.throws(
    () => redactor.write(`-----BEGIN PRIVATE KEY-----${'x'.repeat(256)}`),
    /configured limit/,
  );
});
