import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', '..', 'bin', 'skillctl.js');

test('local CLI lifecycle: init, add, sync, audit, remove', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-e2e-'));
  const store = join(cwd, '.store');
  const source = join(cwd, 'demo-skill');
  const env = { ...process.env, SKILLCTL_STORE: store };
  await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), '---\nname: demo-skill\ndescription: e2e\n---\nDemo\n');

  await execFileAsync(process.execPath, [cli, 'init', '--no-prompt'], { cwd, env });
  await execFileAsync(process.execPath, [cli, 'add', 'file:./demo-skill'], { cwd, env });
  const lock = await readFile(join(cwd, 'agent-skills.lock'), 'utf8');
  assert.match(lock, /demo-skill:/);

  let syncStdout: string;
  try {
    syncStdout = (await execFileAsync(
      process.execPath,
      [cli, 'sync', '--project', '--agent', 'codex', '--json'],
      { cwd, env }
    )).stdout;
  } catch (err) {
    const warningResult = err as { code?: number; stdout?: string };
    assert.equal(warningResult.code, 1);
    syncStdout = warningResult.stdout || '';
  }
  const syncEnvelope = JSON.parse(syncStdout);
  assert.equal(syncEnvelope.ok, true);
  assert.equal((await stat(join(cwd, '.codex', 'skills', 'demo-skill'))).isDirectory(), true);

  let auditStdout: string;
  try {
    auditStdout = (await execFileAsync(process.execPath, [cli, 'audit', '--json'], { cwd, env })).stdout;
  } catch (err) {
    const warningResult = err as { code?: number; stdout?: string };
    assert.equal(warningResult.code, 1);
    auditStdout = warningResult.stdout || '';
  }
  assert.equal(JSON.parse(auditStdout).schemaVersion, 1);

  await execFileAsync(process.execPath, [cli, 'remove', 'demo-skill', '--purge'], { cwd, env });
  await assert.rejects(stat(join(cwd, '.codex', 'skills', 'demo-skill')), (err: NodeJS.ErrnoException) => err.code === 'ENOENT');
});
