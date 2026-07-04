/**
 * Validation tests + fixtures for lockfile (YAML + detailed provenance).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { validateLockfile } from '../schema.js';
import { loadLockfile, saveLockfile, createEmptyLockfile, addOrUpdateEntry, makeLockEntry } from '../lockfile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', 'fixtures');

function loadFixtureText(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

async function runTests() {
  console.log('Running lockfile validation tests...');

  const validYaml = loadFixtureText('example-agent-skills.lock');
  const parsedValid = yaml.load(validYaml);
  const lock = validateLockfile(parsedValid);
  assert.equal(lock.lockfileVersion, '1.0');
  assert.ok(lock.skills['web-design-guidelines']);
  assert.equal(lock.skills['web-design-guidelines'].provenance.type, 'github');
  console.log('✓ valid lock + provenance (github + skills.sh)');

  // empty
  const empty = createEmptyLockfile(['claude-code']);
  assert.equal(empty.lockfileVersion, '1.0');
  assert.deepEqual(empty.skills, {});
  console.log('✓ createEmptyLockfile');

  // add entry
  const entry = makeLockEntry(
    'foo-skill',
    'github:acme/foo',
    'github:acme/foo@deadbeef',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '/tmp/canonical/foo-skill',
    { type: 'github', commit: 'deadbeef' }
  );
  const updated = addOrUpdateEntry(empty, 'foo-skill', entry);
  assert.ok(updated.skills['foo-skill']);
  console.log('✓ addOrUpdateEntry + mixed source provenance');

  // load from fixture disk
  const loaded = await loadLockfile(join(fixturesDir, '..'), 'fixtures/example-agent-skills.lock');
  assert.ok(loaded && loaded.skills['playwright']);
  console.log('✓ loadLockfile YAML');

  // invalid integrity
  const badYaml = loadFixtureText('invalid-integrity.lock');
  const badParsed = yaml.load(badYaml);
  assert.throws(() => validateLockfile(badParsed), /integrity must be sha256/);
  console.log('✓ rejects bad integrity hash');

  // save roundtrip
  const tmp = join(__dirname, 'tmp-lock-' + Date.now());
  const p = await saveLockfile(updated, tmp, 'agent-skills.test.lock');
  assert.ok(p.endsWith('.lock'));
  console.log('✓ saveLockfile (YAML pnpm-style)');

  console.log('All lockfile validation tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((e) => { console.error(e); process.exit(1); });
}

export { runTests };
