import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { materializeGitSkill, removeMaterializedGitSkill } from '../lib/git-comparison.js';

const execFileAsync = promisify(execFile);

test('materializes an immutable comparison skill from a Git ref', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-git-comparison-'));
  const repository = join(root, 'repository');
  const skill = join(repository, '.leogriel', 'skills', 'demo');
  let materialized: Awaited<ReturnType<typeof materializeGitSkill>> | undefined;
  try {
    await mkdir(skill, { recursive: true });
    await git(repository, ['init', '-q']);
    await git(repository, ['config', 'user.name', 'Leogriel Test']);
    await git(repository, ['config', 'user.email', 'test@leogriel.invalid']);
    await writeFile(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: reference\n---\nreference\n');
    await mkdir(join(skill, 'references'));
    await writeFile(join(skill, 'references', 'guide.md'), 'reference guide\n');
    await git(repository, ['add', '.']);
    await git(repository, ['commit', '-q', '-m', 'reference']);
    const commit = (await git(repository, ['rev-parse', 'HEAD'])).trim();

    await writeFile(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: candidate\n---\ncandidate\n');
    materialized = await materializeGitSkill(repository, skill, 'HEAD');
    assert.equal(materialized.commit, commit);
    assert.equal(materialized.requestedRef, 'HEAD');
    assert.equal(materialized.relativeSkillPath, '.leogriel/skills/demo');
    assert.match(await readFile(join(materialized.skillPath, 'SKILL.md'), 'utf8'), /reference/);
    assert.equal(await readFile(join(materialized.skillPath, 'references', 'guide.md'), 'utf8'), 'reference guide\n');
    assert.match(await readFile(join(skill, 'SKILL.md'), 'utf8'), /candidate/);
  } finally {
    await removeMaterializedGitSkill(materialized);
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects missing refs and skills outside the repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-git-comparison-invalid-'));
  const repository = join(root, 'repository');
  const skill = join(repository, 'skill');
  const outside = join(root, 'outside');
  try {
    await Promise.all([mkdir(skill, { recursive: true }), mkdir(outside, { recursive: true })]);
    await git(repository, ['init', '-q']);
    await assert.rejects(materializeGitSkill(repository, outside, 'HEAD'), /inside the current Git repository/);
    await assert.rejects(materializeGitSkill(repository, skill, 'missing-ref'), /unknown revision|Needed a single revision|bad revision/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('accepts a repository reached through a filesystem alias', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-git-comparison-alias-'));
  const repository = join(root, 'repository');
  const alias = join(root, 'repository-alias');
  const skill = join(repository, 'skill');
  let materialized: Awaited<ReturnType<typeof materializeGitSkill>> | undefined;
  try {
    await mkdir(skill, { recursive: true });
    await git(repository, ['init', '-q']);
    await git(repository, ['config', 'user.name', 'Leogriel Test']);
    await git(repository, ['config', 'user.email', 'test@leogriel.invalid']);
    await writeFile(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: alias\n---\nalias\n');
    await git(repository, ['add', '.']);
    await git(repository, ['commit', '-q', '-m', 'reference']);
    await symlink(repository, alias, process.platform === 'win32' ? 'junction' : 'dir');

    materialized = await materializeGitSkill(alias, join(alias, 'skill'), 'HEAD');
    assert.equal(materialized.relativeSkillPath, 'skill');
    assert.match(await readFile(join(materialized.skillPath, 'SKILL.md'), 'utf8'), /alias/);
  } finally {
    await removeMaterializedGitSkill(materialized);
    await rm(root, { recursive: true, force: true });
  }
});

async function git(cwd: string, args: string[]): Promise<string> {
  return (await execFileAsync('git', args, { cwd, windowsHide: true })).stdout;
}
