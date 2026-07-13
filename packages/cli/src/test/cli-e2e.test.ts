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
  assert.equal((await stat(join(cwd, '.skillctl', 'skills'))).isDirectory(), true);
  await execFileAsync(process.execPath, [cli, 'add', 'file:./demo-skill'], { cwd, env });
  const lock = await readFile(join(cwd, 'agent-skills.lock'), 'utf8');
  assert.match(lock, /demo-skill:/);
  assert.match(lock, /canonicalPath: \.skillctl\/skills\/demo-skill/);
  assert.equal((await stat(join(cwd, '.skillctl', 'skills', 'demo-skill'))).isDirectory(), true);

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

test('local add outside a skillctl project explains the local/global choice', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-no-project-'));
  const source = join(cwd, 'demo-skill');
  await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), '---\nname: demo-skill\ndescription: e2e\n---\nDemo\n');

  await assert.rejects(
    execFileAsync(process.execPath, [cli, 'add', 'file:./demo-skill'], { cwd }),
    (error: { stderr?: string }) => {
      assert.match(error.stderr || '', /skillctl add -g/);
      assert.match(error.stderr || '', /skillctl init/);
      return true;
    }
  );
});

test('global add works outside a project and records global state', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-global-add-'));
  const home = join(cwd, 'home');
  const source = join(cwd, 'demo-skill');
  await mkdir(source, { recursive: true });
  await mkdir(home, { recursive: true });
  await writeFile(join(source, 'SKILL.md'), '---\nname: demo-skill\ndescription: e2e\n---\nDemo\n');

  await execFileAsync(process.execPath, [cli, 'add', '-g', 'file:./demo-skill'], {
    cwd,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.equal((await stat(join(home, '.skillctl', 'skills', 'demo-skill'))).isDirectory(), true);
  assert.match(await readFile(join(home, '.skillctl', 'agent-skills.lock'), 'utf8'), /canonicalPath: ~\/\.skillctl/);
});

test('plain import copies discovered skills into the project store', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-import-command-'));
  const source = join(cwd, '.codex', 'skills', 'review');
  await mkdir(source, { recursive: true });
  await writeFile(join(source, 'SKILL.md'), '---\nname: review\ndescription: review code\n---\nReview\n');
  await execFileAsync(process.execPath, [cli, 'init', '--no-prompt'], { cwd });

  await execFileAsync(process.execPath, [cli, 'import'], { cwd });

  assert.equal((await stat(join(cwd, '.skillctl', 'skills', 'review'))).isDirectory(), true);
  assert.equal((await stat(source)).isDirectory(), true);
  assert.match(await readFile(join(cwd, 'agent-skills.json'), 'utf8'), /file:\.\/\.skillctl\/skills\/review/);
});
