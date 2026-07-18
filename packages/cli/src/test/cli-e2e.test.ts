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
const cli = join(here, '..', '..', 'bin', 'leogriel.js');

test('local CLI lifecycle: init, add, sync, audit, remove', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'leogriel-e2e-'));
  const store = join(cwd, '.store');
  const source = join(cwd, 'demo-skill');
  const env = { ...process.env, LEOGRIEL_STORE: store };
  await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), '---\nname: demo-skill\ndescription: e2e\n---\nDemo\n');

  await execFileAsync(process.execPath, [cli, 'init', '--no-prompt'], { cwd, env });
  assert.equal((await stat(join(cwd, '.leogriel', 'skills'))).isDirectory(), true);
  await execFileAsync(process.execPath, [cli, 'add', 'file:./demo-skill'], { cwd, env });
  const lock = await readFile(join(cwd, 'agent-skills.lock'), 'utf8');
  assert.match(lock, /demo-skill:/);
  assert.match(lock, /canonicalPath: \.leogriel\/skills\/demo-skill/);
  assert.equal((await stat(join(cwd, '.leogriel', 'skills', 'demo-skill'))).isDirectory(), true);

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

test('local add outside a leogriel project explains the local/global choice', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'leogriel-no-project-'));
  const source = join(cwd, 'demo-skill');
  await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), '---\nname: demo-skill\ndescription: e2e\n---\nDemo\n');

  await assert.rejects(
    execFileAsync(process.execPath, [cli, 'add', 'file:./demo-skill'], { cwd }),
    (error: { stderr?: string }) => {
      assert.match(error.stderr || '', /leogriel add -g/);
      assert.match(error.stderr || '', /leogriel init/);
      return true;
    }
  );
});

test('global add works outside a project and records global state', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'leogriel-global-add-'));
  const home = join(cwd, 'home');
  const source = join(cwd, 'demo-skill');
  await mkdir(source, { recursive: true });
  await mkdir(home, { recursive: true });
  await writeFile(join(source, 'SKILL.md'), '---\nname: demo-skill\ndescription: e2e\n---\nDemo\n');

  await execFileAsync(process.execPath, [cli, 'add', '-g', 'file:./demo-skill'], {
    cwd,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.equal((await stat(join(home, '.leogriel', 'skills', 'demo-skill'))).isDirectory(), true);
  assert.match(await readFile(join(home, '.leogriel', 'agent-skills.lock'), 'utf8'), /canonicalPath: ~\/\.leogriel/);
});

test('plain import copies discovered skills into the project store', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'leogriel-import-command-'));
  const source = join(cwd, '.codex', 'skills', 'review');
  await mkdir(source, { recursive: true });
  await writeFile(join(source, 'SKILL.md'), '---\nname: review\ndescription: review code\n---\nReview\n');
  await execFileAsync(process.execPath, [cli, 'init', '--no-prompt'], { cwd });

  await execFileAsync(process.execPath, [cli, 'import'], { cwd });

  assert.equal((await stat(join(cwd, '.leogriel', 'skills', 'review'))).isDirectory(), true);
  assert.equal((await stat(source)).isDirectory(), true);
  assert.match(await readFile(join(cwd, 'agent-skills.json'), 'utf8'), /file:\.\/\.leogriel\/skills\/review/);
});

test('non-interactive init with skill honors the explicit request', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'leogriel-init-with-skill-'));
  const source = join(cwd, 'skills', 'leogriel');
  const home = join(cwd, 'home');
  await mkdir(source, { recursive: true });
  await mkdir(home, { recursive: true });
  await writeFile(join(source, 'SKILL.md'), '---\nname: leogriel\ndescription: bundled meta skill\n---\nMeta\n');

  const result = await execFileAsync(
    process.execPath,
    [cli, 'init', '--with-skill', '--no-prompt', '--json'],
    { cwd, env: { ...process.env, HOME: home, USERPROFILE: home } },
  );
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, true);
  assert.match(await readFile(join(cwd, 'agent-skills.json'), 'utf8'), /"leogriel": "file:\.\/\.leogriel\/skills\/leogriel"/);
  assert.match(await readFile(join(cwd, 'agent-skills.lock'), 'utf8'), /leogriel:/);
});

test('plain import emits structured JSON without human output', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'leogriel-import-json-'));
  const source = join(cwd, '.codex', 'skills', 'review');
  await mkdir(source, { recursive: true });
  await writeFile(join(source, 'SKILL.md'), '---\nname: review\ndescription: review code\n---\nReview\n');
  await execFileAsync(process.execPath, [cli, 'init', '--no-prompt'], { cwd });

  const result = await execFileAsync(process.execPath, [cli, 'import', '--json'], { cwd });
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.command, 'import');
  assert.equal(envelope.data.status, 'ok');
  assert.deepEqual(envelope.data.imported, ['review']);
  assert.equal(result.stderr, '');
});

test('plain import rejects interactive selection in JSON mode', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'leogriel-import-json-interactive-'));
  await execFileAsync(process.execPath, [cli, 'init', '--no-prompt'], { cwd });
  await assert.rejects(
    execFileAsync(process.execPath, [cli, 'import', '--json', '--select'], { cwd }),
    (error: { code?: number; stdout?: string }) => {
      assert.equal(error.code, 2);
      const envelope = JSON.parse(error.stdout || '{}');
      assert.equal(envelope.command, 'import');
      assert.match(envelope.errors[0].message, /cannot be combined/);
      return true;
    },
  );
});

test('doctor warns for missing targets and reports current state after fix', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'leogriel-doctor-targets-'));
  const source = join(cwd, 'demo-skill');
  const config = join(cwd, 'config.json');
  const env = {
    ...process.env,
    LEOGRIEL_CONFIG: config,
    LEOGRIEL_STORE: join(cwd, '.store'),
  };
  await mkdir(source, { recursive: true });
  await mkdir(join(cwd, '.codex', 'skills'), { recursive: true });
  await writeFile(join(source, 'SKILL.md'), '---\nname: demo-skill\ndescription: e2e\n---\nDemo\n');
  await writeFile(config, `${JSON.stringify({
    version: 1,
    defaultMode: 'copy',
    agents: {
      'claude-code': false,
      cursor: false,
      opencode: false,
      codex: true,
      'gemini-cli': false,
      grok: false,
      pi: false,
    },
  }, null, 2)}\n`);

  await execFileAsync(process.execPath, [cli, 'init', '--no-prompt'], { cwd, env });
  await execFileAsync(process.execPath, [cli, 'add', 'file:./demo-skill'], { cwd, env });

  let missingStdout = '';
  try {
    await execFileAsync(process.execPath, [cli, 'doctor', '--json'], { cwd, env });
    assert.fail('doctor should report a missing managed target');
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    assert.equal(failure.code, 1);
    missingStdout = failure.stdout || '';
  }
  const missing = JSON.parse(missingStdout);
  assert.equal(missing.data.status, 'warnings');
  assert.equal(missing.data.targets.stateCounts.missing, 1);
  assert.match(missing.data.warnings.join(' '), /doctor --fix/);

  const fixedResult = await execFileAsync(process.execPath, [cli, 'doctor', '--fix', '--json'], { cwd, env });
  const fixed = JSON.parse(fixedResult.stdout);
  assert.equal(fixed.data.status, 'ok');
  assert.equal(fixed.data.targets.stateCounts.current, 1);
  assert.equal(fixed.data.targets.stateCounts.missing, 0);
});
