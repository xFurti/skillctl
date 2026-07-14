import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeDirIntegrity, parseSkillDirectory } from '../index.js';

test('shared parser returns canonical metadata and lock-compatible integrity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-parser-'));
  try {
    await mkdir(join(root, 'scripts'));
    await writeFile(join(root, 'SKILL.md'), '\uFEFF---\nname: Demo Skill\ndescription: demo\nextra: true\n---\nDo the work.\n');
    await writeFile(join(root, 'scripts', 'run.js'), 'export {};\n');
    const parsed = await parseSkillDirectory(root);
    assert.equal(parsed.name, 'demo-skill');
    assert.equal(parsed.instructions.trim(), 'Do the work.');
    assert.equal(parsed.scripts.length, 1);
    assert.equal(parsed.integrity, await computeDirIntegrity(root));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('shared parser rejects invalid YAML and escaping symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-parser-'));
  const outside = await mkdtemp(join(tmpdir(), 'skill-parser-out-'));
  try {
    await writeFile(join(root, 'SKILL.md'), '---\nname: [invalid\n---\n');
    await assert.rejects(parseSkillDirectory(root), /Invalid SKILL.md YAML/);
    await writeFile(join(root, 'SKILL.md'), '---\nname: demo\n---\n');
    await symlink(outside, join(root, 'escape'), 'junction');
    await assert.rejects(parseSkillDirectory(root), /Symlink escapes/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
