import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentAdapter } from '@skillctl/core';
import { linkManager } from '@skillctl/link-manager';
import { inspectSkillTargets, syncSkillsToAgents } from '../sync.js';

test('reports unmanaged targets and replaces them only with an explicit backup', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-reconcile-'));
  const canonical = join(cwd, '.skillctl', 'skills', 'demo');
  const target = join(cwd, '.fake', 'skills', 'demo');
  await mkdir(canonical, { recursive: true });
  await mkdir(target, { recursive: true });
  await writeFile(join(canonical, 'SKILL.md'), '---\nname: demo\n---\nnew');
  await writeFile(join(target, 'SKILL.md'), '---\nname: demo\n---\nold');
  const adapter: AgentAdapter = {
    id: 'fake', name: 'Fake', projectPaths: ['.fake/skills'], globalPaths: [],
    detect: async () => true,
    ensureTarget: async (_name, destination, source, mode) => linkManager.ensureLink(source, destination, { mode }),
    removeTarget: async (_name, destination, source) => linkManager.removeLink(destination, source),
  };
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    const inspected = await inspectSkillTargets([{ name: 'demo', canonicalPath: canonical }], { adapters: [adapter], scope: 'project' });
    assert.equal(inspected.actions[0].state, 'unmanaged');
    const result = await syncSkillsToAgents([{ name: 'demo', canonicalPath: canonical }], {
      adapters: [adapter], scope: 'project', replaceUnmanaged: true, skillNames: ['demo'],
    });
    assert.equal(result.counts.updated, 1);
    const backups = await readdir(join(cwd, '.skillctl', 'backups'), { recursive: true });
    assert.ok(backups.some((path) => String(path).endsWith('metadata.json')));
    assert.match(await import('node:fs/promises').then((fs) => fs.readFile(join(target, 'SKILL.md'), 'utf8')), /new/);
  } finally {
    process.chdir(previous);
  }
});
