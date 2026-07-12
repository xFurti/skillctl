import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  normalizeLocalSpecifier,
  portableSpecifierForResolved,
  formatCanonicalPathForLock,
  expandTilde,
} from '../index.js';

test('normalizeLocalSpecifier keeps file:./ in project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'norm-spec-'));
  try {
    const skillDir = join(root, 'some-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: some-skill\n---\n');

    const rel = normalizeLocalSpecifier('file:./some-skill', root);
    assert.equal(rel.portable, 'file:./some-skill');
    assert.equal(rel.outsideProject, false);
    assert.ok(rel.absPath.endsWith('some-skill'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('normalizeLocalSpecifier rewrites abs-in-project to file:./', async () => {
  const root = await mkdtemp(join(tmpdir(), 'norm-spec-'));
  try {
    const skillDir = join(root, 'some-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: some-skill\n---\n');

    const absInProject = normalizeLocalSpecifier(`file:${skillDir}`, root);
    assert.equal(absInProject.portable, 'file:./some-skill');
    assert.equal(absInProject.outsideProject, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('normalizeLocalSpecifier maps outside-project to local:imported', async () => {
  const root = await mkdtemp(join(tmpdir(), 'norm-spec-'));
  const outsideParent = await mkdtemp(join(tmpdir(), 'outside-parent-'));
  const outside = join(outsideParent, 'outside');
  try {
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'SKILL.md'), '---\nname: outside\n---\n');
    const out = normalizeLocalSpecifier(`file:${outside}`, root);
    assert.equal(out.portable, 'local:imported/outside');
    assert.equal(out.outsideProject, true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outsideParent, { recursive: true, force: true });
  }
});

test('normalizeLocalSpecifier preserves local:imported', () => {
  const imported = normalizeLocalSpecifier('local:imported/my-skill', '/tmp');
  assert.equal(imported.portable, 'local:imported/my-skill');
});

test('portableSpecifierForResolved adds github: prefix', () => {
  const remote = portableSpecifierForResolved(
    'acme/demo',
    { sourceType: 'github', resolved: 'github:acme/demo@HEAD' },
    '/tmp'
  );
  assert.equal(remote, 'github:acme/demo');
});

test('formatCanonicalPathForLock and expandTilde', () => {
  assert.equal(formatCanonicalPathForLock('My Skill'), '.skillctl/skills/my-skill');
  assert.equal(formatCanonicalPathForLock('My Skill', 'global'), '~/.skillctl/skills/my-skill');
  assert.ok(expandTilde('~/.skillctl/skills/foo').includes('.skillctl'));
});
