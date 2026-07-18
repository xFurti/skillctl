import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  formatCanonicalPathForLock,
  getDefaultConfig,
  getProjectSkillsStore,
  loadConfig,
  resolveCanonicalPath,
  resolvePathInside,
  saveConfig,
} from '../index.js';

test('loadConfig distinguishes a missing config from a corrupted config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-config-'));
  const missing = join(root, 'nested', 'config.json');
  assert.equal((await loadConfig(missing)).version, 1);

  const invalid = join(root, 'invalid.json');
  await writeFile(invalid, '{not-json');
  await assert.rejects(loadConfig(invalid), /Unable to load leogriel config/);
});

test('saveConfig creates the parent of a custom path atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-config-save-'));
  const path = join(root, 'custom', 'config.json');
  await saveConfig(getDefaultConfig(), path);
  await saveConfig({ ...getDefaultConfig(), defaultMode: 'copy' }, path);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).version, 1);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).defaultMode, 'copy');
});

test('resolvePathInside rejects absolute and escaping paths', () => {
  const root = join(tmpdir(), 'leogriel-root');
  assert.equal(resolvePathInside(root, 'skills/demo'), join(root, 'skills', 'demo'));
  assert.throws(() => resolvePathInside(root, '../outside'), /escapes its root/);
  assert.throws(() => resolvePathInside(root, resolve(root, 'absolute')), /absolute/);
});

test('project lock paths resolve inside the supplied project store', () => {
  const projectStore = join('/project', '.leogriel', 'skills');
  assert.equal(formatCanonicalPathForLock('My Skill'), '.leogriel/skills/my-skill');
  assert.equal(
    resolveCanonicalPath('.leogriel/skills/my-skill', projectStore),
    join(projectStore, 'my-skill')
  );
  assert.equal(formatCanonicalPathForLock('My Skill', 'global'), '~/.leogriel/skills/my-skill');
  assert.equal(
    resolveCanonicalPath('.skillctl/skills/my-skill', projectStore),
    join(projectStore, 'my-skill')
  );
  assert.equal(
    resolveCanonicalPath('~/.skillctl/skills/my-skill', projectStore),
    join(projectStore, 'my-skill')
  );
});

test('loadConfig ignores removed no-op registry and experimental plugin fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-config-legacy-fields-'));
  const path = join(root, 'config.json');
  await writeFile(path, JSON.stringify({
    version: 1,
    registries: ['https://unused.example'],
    experimental: { plugins: true },
  }));
  const config = await loadConfig(path);
  assert.equal('registries' in config, false);
  assert.equal('experimental' in config, false);
});

test('new environment variables take precedence while legacy overrides remain readable', async () => {
  const current = process.env.LEOGRIEL_STORE;
  const legacy = process.env.SKILLCTL_STORE;
  try {
    process.env.SKILLCTL_STORE = join(tmpdir(), 'legacy-store');
    delete process.env.LEOGRIEL_STORE;
    assert.equal((await loadConfig(join(tmpdir(), 'missing-leogriel-config.json'))).store, join(tmpdir(), 'legacy-store'));
    process.env.LEOGRIEL_STORE = join(tmpdir(), 'current-store');
    assert.equal((await loadConfig(join(tmpdir(), 'missing-leogriel-config.json'))).store, join(tmpdir(), 'current-store'));
  } finally {
    if (current === undefined) delete process.env.LEOGRIEL_STORE;
    else process.env.LEOGRIEL_STORE = current;
    if (legacy === undefined) delete process.env.SKILLCTL_STORE;
    else process.env.SKILLCTL_STORE = legacy;
  }
});

test('project stores prefer Leogriel but continue an existing legacy skillctl store', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-store-migration-'));
  const legacy = join(root, '.skillctl', 'skills');
  await mkdir(legacy, { recursive: true });
  assert.equal(getProjectSkillsStore(root), legacy);

  await mkdir(join(root, '.leogriel'), { recursive: true });
  assert.equal(getProjectSkillsStore(root), join(root, '.leogriel', 'skills'));
});

function resolve(...parts: string[]): string {
  return join(...parts);
}
