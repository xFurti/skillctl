import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { program } from '../index.js';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '..', '..', 'bin', 'leogriel.js');
const commandsDir = resolve(here, '..', 'commands');

test('first-party JSON commands emit one stable envelope', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-json-contract-'));
  const project = join(root, 'project');
  const env = {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    LEOGRIEL_CONFIG: join(root, 'config.json'),
    LEOGRIEL_STORE: join(root, 'store'),
    NO_COLOR: '1',
  };
  try {
    await mkdir(project, { recursive: true });
    await runJson(['init', '--no-prompt', '--json'], project, env);
    await runJson(['test', 'init', 'fixture-skill', '--json'], project, env);
    for (const args of [
      ['list', '--json'],
      ['doctor', '--json'],
      ['plugin', 'list', '--json'],
      ['plugin', 'doctor', '--json'],
      ['test', 'list', '--json'],
      ['test', 'validate', '--json'],
    ]) {
      const result = await runJson(args, project, env, true);
      assert.equal(result.value.schemaVersion, 1);
      assert.equal(typeof result.value.ok, 'boolean');
      assert.equal(result.value.command, args.slice(0, 2).join(' ').replace(/^list .*/, 'list').replace(/^doctor .*/, 'doctor'));
      assert.ok(Array.isArray(result.value.warnings));
      assert.ok(Array.isArray(result.value.errors));
      assert.doesNotMatch(result.stdout, /\u001b\[/);
      assert.equal(result.stdout.trim().split(/\r?\n(?=\{)/).length, 1);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('command handlers do not write through console directly', async () => {
  for (const file of await readdir(commandsDir)) {
    if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;
    const source = await readFile(join(commandsDir, file), 'utf8');
    assert.doesNotMatch(source, /console\.(?:log|warn|error)\s*\(/, file);
  }
});

test('completion JSON returns the selected shell and script', async () => {
  const result = await runJson(['completion', 'bash', '--json'], process.cwd(), process.env);
  assert.equal(result.value.command, 'completion');
  assert.equal(result.value.data.shell, 'bash');
  assert.match(result.value.data.script, /complete -F _leogriel leogriel/);
});

test('Commander hierarchy identifies parent actions and every first-party parse error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-json-hierarchy-'));
  const project = join(root, 'project');
  const env = { ...process.env, HOME: root, USERPROFILE: root, LEOGRIEL_CONFIG: join(root, 'config.json'), LEOGRIEL_STORE: join(root, 'store') };
  try {
    await mkdir(project, { recursive: true });
    await runJson(['init', '--no-prompt', '--json'], project, env);
    if (program.commands.some((command) => command.name() === 'test')) {
      const parent = await runJsonFailure(['test', 'missing-skill', '--json'], project, env);
      assert.equal(parent.command, 'test');
    }
    for (const item of collectCommands(program)) {
      const value = await runJsonFailure([...item.argv, ...item.required, '--json', '--definitely-invalid'], project, env);
      assert.equal(value.command, item.path, item.path);
      assert.equal(value.ok, false, item.path);
      assert.ok(value.errors.length, item.path);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('human Commander diagnostics redact configured secrets', async () => {
  const secret = 'secret-command-abcdefghijklmnop';
  try {
    await execFileAsync(process.execPath, [cli, secret], { env: { ...process.env, GITHUB_TOKEN: secret } });
    assert.fail('unknown command should fail');
  } catch (error) {
    const failure = error as { stderr?: string };
    assert.doesNotMatch(failure.stderr || '', new RegExp(secret));
    assert.match(failure.stderr || '', /REDACTED/);
  }
});

test('human and JSON diagnostics redact Claude credentials', async () => {
  const secret = 'anthropic-secret-abcdefghijklmnop';
  for (const args of [[secret], [secret, '--json']]) {
    try {
      await execFileAsync(process.execPath, [cli, ...args], { env: { ...process.env, ANTHROPIC_API_KEY: secret } });
      assert.fail('unknown command should fail');
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      const output = `${failure.stdout || ''}\n${failure.stderr || ''}`;
      assert.doesNotMatch(output, new RegExp(secret));
      assert.match(output, /REDACTED/);
    }
  }
});

test('command-handler errors are redacted in human and JSON output', async () => {
  const secret = 'handler-secret-abcdefghijklmnop';
  const env = { ...process.env, GITHUB_TOKEN: secret };
  for (const args of [['info', secret], ['info', secret, '--json']]) {
    try {
      await execFileAsync(process.execPath, [cli, ...args], { env });
      assert.fail('inspecting an unsupported specifier should fail');
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      assert.doesNotMatch(`${failure.stdout || ''}${failure.stderr || ''}`, new RegExp(secret));
      assert.match(`${failure.stdout || ''}${failure.stderr || ''}`, /REDACTED/);
    }
  }
});

function collectCommands(root: import('commander').Command): Array<{ path: string; argv: string[]; required: string[] }> {
  const result: Array<{ path: string; argv: string[]; required: string[] }> = [];
  const visit = (command: import('commander').Command, argv: string[], names: string[]): void => {
    for (const child of command.commands) {
      const childArgv = [...argv, child.name()];
      const childNames = [...names, child.name()];
      result.push({
        path: childNames.join(' '),
        argv: childArgv,
        required: child.registeredArguments.filter((argument) => argument.required).map(() => 'fixture'),
      });
      visit(child, childArgv, childNames);
    }
  };
  visit(root, [], []);
  return result;
}

async function runJsonFailure(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  try {
    const result = await execFileAsync(process.execPath, [cli, ...args], { cwd, env });
    return JSON.parse(result.stdout);
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    assert.equal(failure.code, 2, args.join(' '));
    return JSON.parse(failure.stdout || '{}');
  }
}

async function runJson(args: string[], cwd: string, env: NodeJS.ProcessEnv, allowOne = false) {
  try {
    const result = await execFileAsync(process.execPath, [cli, ...args], { cwd, env });
    return { ...result, value: JSON.parse(result.stdout) };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    if (!allowOne || failure.code !== 1) throw error;
    return { stdout: failure.stdout || '', stderr: failure.stderr || '', value: JSON.parse(failure.stdout || '{}') };
  }
}
