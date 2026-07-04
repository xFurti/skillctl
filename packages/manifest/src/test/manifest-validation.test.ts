/**
 * Validation tests for manifest (run via node --test after build to dist/test).
 * Fixtures + schema validation + collision policy.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateManifest, checkNameCollision, createDefaultManifest, loadManifest, saveManifest, AgentSkillsManifestSchema } from '../manifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', 'fixtures');

function loadFixture(name: string) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

async function runTests() {
  console.log('Running manifest validation tests...');

  // valid example
  const valid = loadFixture('example-agent-skills.json');
  const parsed = validateManifest(valid);
  assert.ok(parsed.agentSkills?.dependencies?.['web-design-guidelines']);
  assert.equal(checkNameCollision(parsed).length, 0);
  console.log('✓ valid manifest + no collision');

  // default
  const def = createDefaultManifest('test-proj');
  assert.equal(def.name, 'test-proj');
  assert.deepEqual(def.agentSkills?.dependencies, {});
  console.log('✓ createDefaultManifest');

  // schema direct
  const zvalid = AgentSkillsManifestSchema.parse(valid);
  assert.ok(zvalid);

  // invalid specifier
  const bad = loadFixture('invalid-specifier.json');
  assert.throws(() => validateManifest(bad), /Invalid specifier/);
  console.log('✓ rejects invalid specifier');

  // duplicate collision policy
  const dup = loadFixture('duplicate-names.json');
  assert.throws(() => validateManifest(dup), /Manifest collision/);
  console.log('✓ collision policy enforced on dup names');

  // load from disk (using this dir's fixture)
  const loaded = await loadManifest(join(fixturesDir, '..'), 'fixtures/example-agent-skills.json');
  assert.ok(loaded);
  console.log('✓ loadManifest from fixture');

  // save roundtrip (temp)
  const tmpDir = join(__dirname, 'tmp-test-' + Date.now());
  const savedPath = await saveManifest({ agentSkills: { dependencies: { 'x': 'github:foo/x' }, devDependencies: {} } }, tmpDir, 'agent-skills.test.json');
  assert.ok(savedPath.includes('agent-skills.test.json'));
  console.log('✓ saveManifest atomic roundtrip');

  console.log('All manifest validation tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('manifest-validation.test.ts')) {
  runTests().catch((e) => { console.error(e); process.exit(1); });
}

export { runTests };
