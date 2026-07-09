import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { LinkManager } from '../link-manager.js';

test('refuses to overwrite or remove an unmanaged target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-link-safety-'));
  const canonical = join(root, 'canonical');
  const target = join(root, 'target');
  await mkdir(canonical);
  await mkdir(target);
  await writeFile(join(canonical, 'SKILL.md'), 'canonical');
  await writeFile(join(target, 'user.txt'), 'keep me');

  const manager = new LinkManager();
  await assert.rejects(manager.ensureLink(canonical, target, { mode: 'copy' }), /unmanaged target/);
  await assert.rejects(manager.removeLink(target, canonical), /not a link or copy managed/);
  assert.equal((await stat(join(target, 'user.txt'))).isFile(), true);
});

test('managed copies can be removed only with their canonical path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-link-managed-'));
  const canonical = join(root, 'canonical');
  const target = join(root, 'target');
  await mkdir(canonical);
  await writeFile(join(canonical, 'SKILL.md'), 'canonical');

  const manager = new LinkManager();
  await manager.ensureLink(canonical, target, { mode: 'copy' });
  await assert.rejects(manager.removeLink(target), /canonical path is required/);
  await manager.removeLink(target, canonical);
  await assert.rejects(stat(target), (err: NodeJS.ErrnoException) => err.code === 'ENOENT');
});
