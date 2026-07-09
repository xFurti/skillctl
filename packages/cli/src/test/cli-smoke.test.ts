import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { computeDirIntegrity, formatCanonicalPathForLock } from '@skillctl/core';
import { createEmptyLockfile, makeLockEntry, saveLockfile } from '@skillctl/lockfile';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', '..', 'bin', 'skillctl.js');

test('CLI awaits async parsing and reports its version', async () => {
  const { stdout } = await execFileAsync(process.execPath, [cli, '--version']);
  assert.match(stdout, /^0\.4\.0\s*$/);
});

test('frozen install rejects a manifest dependency missing from the lockfile', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-frozen-'));
  await writeFile(
    join(cwd, 'agent-skills.json'),
    JSON.stringify({ agentSkills: { dependencies: { demo: 'github:owner/demo' } } })
  );

  await assert.rejects(
    execFileAsync(process.execPath, [cli, 'install', '--frozen', '--no-sync'], { cwd }),
    (err: NodeJS.ErrnoException & { code?: number; stderr?: string }) =>
      err.code === 2 && Boolean(err.stderr?.includes('missing from lockfile'))
  );
});

test('frozen install restores an empty store without changing the lockfile', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-frozen-restore-'));
  const store = join(cwd, '.store');
  const source = join(cwd, 'demo-skill');
  await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), '---\nname: demo\n---\nlocked content\n');
  await writeFile(
    join(cwd, 'agent-skills.json'),
    JSON.stringify({ agentSkills: { dependencies: { demo: 'file:./demo-skill' } } })
  );
  const lock = createEmptyLockfile();
  lock.skills.demo = makeLockEntry(
    'demo',
    'file:./demo-skill',
    'file:./demo-skill',
    await computeDirIntegrity(source),
    formatCanonicalPathForLock('demo'),
    { type: 'local' }
  );
  await saveLockfile(lock, cwd);
  const before = await readFile(join(cwd, 'agent-skills.lock'), 'utf8');

  await execFileAsync(process.execPath, [cli, 'install', '--frozen', '--no-sync'], {
    cwd,
    env: { ...process.env, SKILLCTL_STORE: store },
  });

  assert.match(await readFile(join(store, 'demo', 'SKILL.md'), 'utf8'), /locked content/);
  assert.equal(await readFile(join(cwd, 'agent-skills.lock'), 'utf8'), before);

  await writeFile(join(store, 'demo', 'SKILL.md'), 'corrupt');
  await execFileAsync(process.execPath, [cli, 'install', '--frozen', '--no-sync'], {
    cwd,
    env: { ...process.env, SKILLCTL_STORE: store },
  });
  assert.match(await readFile(join(store, 'demo', 'SKILL.md'), 'utf8'), /locked content/);
});
