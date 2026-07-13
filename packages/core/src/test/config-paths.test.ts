import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  formatCanonicalPathForLock,
  getDefaultConfig,
  loadConfig,
  resolveCanonicalPath,
  resolvePathInside,
  saveConfig,
} from '../index.js';

test('loadConfig distinguishes a missing config from a corrupted config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-config-'));
  const missing = join(root, 'nested', 'config.json');
  assert.equal((await loadConfig(missing)).version, 1);

  const invalid = join(root, 'invalid.json');
  await writeFile(invalid, '{not-json');
  await assert.rejects(loadConfig(invalid), /Unable to load skillctl config/);
});

test('saveConfig creates the parent of a custom path atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-config-save-'));
  const path = join(root, 'custom', 'config.json');
  await saveConfig(getDefaultConfig(), path);
  await saveConfig({ ...getDefaultConfig(), defaultMode: 'copy' }, path);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).version, 1);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).defaultMode, 'copy');
});

test('resolvePathInside rejects absolute and escaping paths', () => {
  const root = join(tmpdir(), 'skillctl-root');
  assert.equal(resolvePathInside(root, 'skills/demo'), join(root, 'skills', 'demo'));
  assert.throws(() => resolvePathInside(root, '../outside'), /escapes its root/);
  assert.throws(() => resolvePathInside(root, resolve(root, 'absolute')), /absolute/);
});

test('project lock paths resolve inside the supplied project store', () => {
  const projectStore = join('/project', '.skillctl', 'skills');
  assert.equal(formatCanonicalPathForLock('My Skill'), '.skillctl/skills/my-skill');
  assert.equal(
    resolveCanonicalPath('.skillctl/skills/my-skill', projectStore),
    join(projectStore, 'my-skill')
  );
  assert.equal(formatCanonicalPathForLock('My Skill', 'global'), '~/.skillctl/skills/my-skill');
});

function resolve(...parts: string[]): string {
  return join(...parts);
}
