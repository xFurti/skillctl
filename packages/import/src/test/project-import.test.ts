import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planImportFromProject } from '../migrate.js';
import { classifySkillPath } from '../parsers/link-classifier.js';
import { discoverProjectSkills } from '../discover-project-skills.js';
import '@skillctl/adapters';

async function writeSkill(dir: string, name: string): Promise<string> {
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), `---\nname: ${name}\n---\n`, 'utf8');
  return skillDir;
}

test('discoverProjectSkills finds skills in .codex/skills', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-import-'));
  try {
    await writeSkill(join(root, '.codex', 'skills'), 'my-tdd');
    const { deduped, sources } = await discoverProjectSkills({ cwd: root });
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].name, 'my-tdd');
    assert.equal(deduped[0].action, 'copy-local');
    assert.ok(sources.some((s) => s.projectPath === '.codex/skills'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('planImportFromProject uses a vendored project-relative specifier', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-import-'));
  try {
    await writeSkill(join(root, '.claude', 'skills'), 'grill-me');
    const { plan } = await planImportFromProject(root);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].action, 'copy-local');
    assert.equal(plan[0].specifier, 'file:./.skillctl/skills/grill-me');
    assert.match(plan[0].originalPath || '', /\.claude\/skills\/grill-me/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('classifySkillPath detects skillctl-link under store root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-store-'));
  try {
    const store = join(root, 'store');
    const skill = await writeSkill(store, 'linked-skill');
    const linkParent = join(root, 'project', '.codex', 'skills');
    await mkdir(linkParent, { recursive: true });
    const linkPath = join(linkParent, 'linked-skill');
    if (process.platform === 'win32') {
      const { symlink } = await import('node:fs/promises');
      await symlink(skill, linkPath, 'junction');
    } else {
      await symlink(skill, linkPath, 'dir');
    }
    const classified = await classifySkillPath(linkPath, store);
    assert.equal(classified.kind, 'skillctl-link');
    assert.equal(classified.canonicalName, 'linked-skill');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('project import refuses conflicting skills with the same canonical name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-project-conflict-'));
  try {
    await writeSkill(join(root, '.codex', 'skills'), 'same-name');
    const other = await writeSkill(join(root, '.claude', 'skills'), 'same-name');
    await writeFile(join(other, 'extra.txt'), 'different content');

    const { plan } = await planImportFromProject(root);
    const conflict = plan.find((item) => item.name === 'same-name');
    assert.equal(conflict?.action, 'skip-conflict');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
