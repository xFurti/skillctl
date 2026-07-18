import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CodexRunner, createIsolation, destroyIsolation, findWindowsStandaloneCodex, runProcess, runSkillTests, validateTestFile,
  type AgentRunRequest,
} from '../index.js';

const REQUIRED_HELP = '--json --ephemeral --ignore-user-config --ignore-rules --sandbox --strict-config --skip-git-repo-check';

test('Windows runner selects the newest complete standalone Codex installation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-codex-install-'));
  const createRelease = async (version: string, complete = true) => {
    const release = join(root, '.codex', 'packages', 'standalone', 'releases', `${version}-x86_64-pc-windows-msvc`);
    await mkdir(join(release, 'bin'), { recursive: true });
    await mkdir(join(release, 'codex-resources'), { recursive: true });
    await writeFile(join(release, 'bin', 'codex.exe'), 'codex');
    await writeFile(join(release, 'codex-resources', 'codex-windows-sandbox-setup.exe'), 'setup');
    if (complete) await writeFile(join(release, 'codex-resources', 'codex-command-runner.exe'), 'runner');
    return join(release, 'bin', 'codex.exe');
  };
  try {
    const older = await createRelease('0.144.9');
    const newer = await createRelease('0.144.10');
    await createRelease('0.145.0', false);
    assert.equal(findWindowsStandaloneCodex({ platform: 'win32', userProfile: root }), newer);
    assert.notEqual(findWindowsStandaloneCodex({ platform: 'win32', userProfile: root }), older);
    assert.equal(findWindowsStandaloneCodex({ platform: 'linux', userProfile: root }), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Codex detection checks only version and advertised flags', async () => {
  const fixture = await fakeCodex('valid');
  const missing = await fakeCodex('missing-flags');
  const strict = await fakeCodex('strict-rejected');
  try {
    const detected = await fixture.runner.detect();
    assert.equal(detected.available, true);
    assert.match(detected.version || '', /1\.2\.3/);
    assert.ok(detected.capabilities.includes('environment filtering'));
    assert.match((await missing.runner.detect()).reason || '', /lacks required flags/);
    assert.equal((await strict.runner.detect()).available, true);
  } finally { await Promise.all([fixture.cleanup(), missing.cleanup(), strict.cleanup()]); }
});

test('strict configuration rejection happens during execution and remains incomplete', async () => {
  const fixture = await fakeCodex('strict-rejected');
  const isolation = await createIsolation();
  try {
    const result = await fixture.runner.run(request(isolation, 'prompt', 2_000));
    assert.equal(result.ok, false);
    assert.equal(result.incomplete, true);
    assert.match(result.error || '', /strict config rejected/);
  } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
});

test('strict configuration rejection makes the paired verdict inconclusive without fallback', async () => {
  const fixture = await fakeCodex('strict-rejected');
  const root = await mkdtemp(join(tmpdir(), 'leogriel-strict-verdict-'));
  const skill = join(root, 'skill');
  const previous = process.env.CODEX_API_KEY;
  process.env.CODEX_API_KEY = 'codex-secret-abcdefghijklmnop';
  try {
    await mkdir(skill);
    await writeFile(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: strict test\n---\nwork');
    const definition = validateTestFile({
      version: 1,
      skill: 'demo',
      cases: [{ name: 'strict', prompt: 'work', assertions: [{ type: 'file-exists', path: 'output.txt' }] }],
    });
    const result = await runSkillTests(definition, {
      testFilePath: join(root, 'missing.yaml'),
      skillPath: skill,
      runner: fixture.runner,
      runs: 1,
      model: 'fixed-model',
      leogrielVersion: '0.9.0',
    });
    assert.equal(result.verdict, 'inconclusive');
    assert.match(result.cases[0].pairs[0].baseline.runnerError || '', /strict config rejected/);
  } finally {
    if (previous === undefined) delete process.env.CODEX_API_KEY; else process.env.CODEX_API_KEY = previous;
    await fixture.cleanup();
    await rm(root, { recursive: true, force: true });
  }
});

test('Codex receives prompt on stdin and exposes safe tool environment without API keys', async () => {
  const fixture = await fakeCodex('valid');
  const isolation = await createIsolation();
  try {
    const result = await fixture.runner.run(request(isolation, 'secret prompt', 2_000));
    assert.equal(result.ok, true);
    assert.equal(await readFile(join(fixture.root, 'prompt.txt'), 'utf8'), 'secret prompt');
    const recorded = JSON.parse(await readFile(join(fixture.root, 'record.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(recorded.lastArgument, '-');
    assert.equal(recorded.nodeFound, true);
    assert.equal(recorded.childCodexKey, false);
    assert.equal(recorded.childOpenAiKey, false);
    assert.equal(recorded.childCodexHome, false);
    assert.equal(recorded.parentCodexKey, true);
    assert.equal(recorded.parentOpenAiKey, false);
    assert.match(String(recorded.arguments), /shell_environment_policy\.inherit="all"/);
    assert.match(String(recorded.arguments), /shell_environment_policy\.ignore_default_excludes=false/);
    assert.match(String(recorded.arguments), /approval_policy="never"/);
    if (process.platform === 'win32') assert.match(String(recorded.arguments), /windows\.sandbox="elevated"/);
    assert.match(String(recorded.arguments), /PATH/);
    assert.doesNotMatch(String(recorded.arguments), /CODEX_API_KEY|OPENAI_API_KEY/);
    assert.deepEqual(result.tokenUsage, { input: 10, cachedInput: 3, output: 4, reasoning: 2, total: 16 });
    assert.equal(result.resolvedModel, 'fake-model');
  } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
});

test('ChatGPT auth preflights the explicit profile without exposing or modifying it', async () => {
  const fixture = await fakeCodex('valid');
  const isolation = await createIsolation();
  const authHome = await mkdtemp(join(tmpdir(), 'leogriel-chatgpt-auth-'));
  const sentinel = join(authHome, 'auth.json');
  await writeFile(sentinel, '{"authenticated":true}');
  try {
    const input = request(isolation, 'chatgpt prompt', 2_000);
    input.auth = chatgptAuth(authHome);
    const result = await fixture.runner.run(input);
    assert.equal(result.ok, true, result.error);
    const status = JSON.parse(await readFile(join(fixture.root, 'login-status.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(status.codexHome, authHome);
    assert.equal(status.home, isolation.home);
    assert.equal(status.userprofile, isolation.userprofile);
    assert.equal(status.codexKey, false);
    assert.equal(status.openAiKey, false);
    const execution = JSON.parse(await readFile(join(fixture.root, 'record.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(execution.parentCodexKey, false);
    assert.equal(execution.parentOpenAiKey, false);
    assert.equal(execution.childCodexHome, false);
    assert.match(String(execution.arguments), /--ignore-user-config/);
    assert.match(String(execution.arguments), /--ignore-rules/);
    assert.match(String(execution.arguments), /--ephemeral/);
    assert.equal(await readFile(sentinel, 'utf8'), '{"authenticated":true}');
  } finally {
    await destroyIsolation(isolation);
    assert.equal(await readFile(sentinel, 'utf8'), '{"authenticated":true}');
    await Promise.all([fixture.cleanup(), rm(authHome, { recursive: true, force: true })]);
  }
});

test('ChatGPT auth stops with remediation when login status fails', async () => {
  const fixture = await fakeCodex('login-unauthenticated');
  const isolation = await createIsolation();
  const authHome = await mkdtemp(join(tmpdir(), 'leogriel-chatgpt-auth-'));
  try {
    const input = request(isolation, 'must not execute', 2_000);
    input.auth = chatgptAuth(authHome);
    const result = await fixture.runner.run(input);
    assert.equal(result.ok, false);
    assert.equal(result.incomplete, true);
    assert.match(result.error || '', /codex login/);
    await assert.rejects(readFile(join(fixture.root, 'prompt.txt')));
  } finally {
    await destroyIsolation(isolation);
    await Promise.all([fixture.cleanup(), rm(authHome, { recursive: true, force: true })]);
  }
});

test('ChatGPT auth fails closed before detection when an API key is also present', async () => {
  const fixture = await fakeCodex('valid');
  const isolation = await createIsolation();
  const authHome = await mkdtemp(join(tmpdir(), 'leogriel-chatgpt-auth-'));
  const previous = process.env.CODEX_API_KEY;
  process.env.CODEX_API_KEY = 'unexpected-api-key-abcdefghijklmnop';
  try {
    const input = request(isolation, 'must not execute', 2_000);
    input.auth = chatgptAuth(authHome);
    const result = await fixture.runner.run(input);
    assert.equal(result.incomplete, true);
    assert.match(result.error || '', /cannot be combined/);
    await assert.rejects(readFile(join(fixture.root, 'login-status.json')));
  } finally {
    if (previous === undefined) delete process.env.CODEX_API_KEY; else process.env.CODEX_API_KEY = previous;
    await destroyIsolation(isolation);
    await Promise.all([fixture.cleanup(), rm(authHome, { recursive: true, force: true })]);
  }
});

test('Codex redacts secrets from stdout, stderr, split chunks, JSONL, and nonzero errors', async () => {
  const secret = 'codex-secret-abcdefghijklmnop';
  for (const mode of ['leak-stdout', 'leak-stderr', 'leak-split', 'leak-jsonl', 'leak-exit']) {
    const fixture = await fakeCodex(mode);
    const isolation = await createIsolation();
    try {
      const result = await fixture.runner.run(request(isolation, 'prompt', 2_000));
      assert.doesNotMatch(result.output, new RegExp(secret), `${mode} output`);
      assert.doesNotMatch(result.stderr || '', new RegExp(secret), `${mode} stderr`);
      assert.doesNotMatch(result.error || '', new RegExp(secret), `${mode} error`);
      if (mode !== 'leak-stderr') assert.match(`${result.output}\n${result.error || ''}`, /REDACTED/, mode);
      else {
        assert.match(result.stderr || '', /REDACTED/);
        const direct = await runProcess(process.execPath, [fixture.script, 'exec', '--strict-config', '-'], {
          timeoutMs: 2_000,
          env: { ...process.env, CODEX_API_KEY: secret, OPENAI_API_KEY: undefined },
          input: 'prompt',
          knownSecrets: { CODEX_API_KEY: secret },
        });
        assert.doesNotMatch(direct.stderr, new RegExp(secret));
        assert.match(direct.stderr, /REDACTED/);
      }
      if (mode === 'leak-exit') assert.equal(result.incomplete, true);
    } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
  }
});

test('Codex JSONL failures, missing completion, truncation, and nonzero exit are incomplete', async () => {
  for (const [mode, expected] of [
    ['invalid-jsonl', /Invalid Codex JSONL/],
    ['missing-final', /missing required start or final events/],
    ['exit-no-stderr', /exited with code 7/],
  ] as const) {
    const fixture = await fakeCodex(mode);
    const isolation = await createIsolation();
    try {
      const result = await fixture.runner.run(request(isolation, 'prompt', 2_000));
      assert.equal(result.incomplete, true);
      assert.match(result.error || '', expected);
    } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
  }

  const fixture = await fakeCodex('large-output', 128);
  const isolation = await createIsolation();
  try {
    const result = await fixture.runner.run(request(isolation, 'prompt', 2_000));
    assert.equal(result.outputTruncated, true);
    assert.equal(result.incomplete, true);
    assert.match(result.error || '', /exceeded the configured limit/);
  } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
});

test('Codex Windows sandbox launch failures remain incomplete even after a completed turn', async () => {
  const fixture = await fakeCodex('sandbox-launch-failed');
  const isolation = await createIsolation();
  try {
    const result = await fixture.runner.run(request(isolation, 'prompt', 2_000));
    assert.equal(result.ok, false);
    assert.equal(result.incomplete, true);
    assert.match(result.error || '', /Codex Windows sandbox:.*CreateProcessWithLogonW failed/);
  } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
});

test('Codex timeout terminates the complete process tree', async () => {
  const fixture = await fakeCodex('timeout-tree');
  const isolation = await createIsolation();
  try {
    const result = await fixture.runner.run(request(isolation, 'prompt', 150));
    assert.equal(result.timedOut, true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await assert.rejects(readFile(join(fixture.root, 'child-survived.txt')));
  } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
});

test('raw output without newlines is bounded and terminates the complete process tree', async () => {
  const fixture = await fakeCodex('output-limit-tree', 128);
  const isolation = await createIsolation();
  try {
    const result = await fixture.runner.run(request(isolation, 'prompt', 2_000));
    assert.equal(result.outputTruncated, true);
    assert.equal(result.timedOut, false);
    assert.ok(Buffer.byteLength(result.output) <= 128);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await assert.rejects(readFile(join(fixture.root, 'output-child-survived.txt')));
  } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
});

function request(layout: Awaited<ReturnType<typeof createIsolation>>, prompt: string, timeoutMs: number): AgentRunRequest {
  return {
    prompt,
    workspace: layout.workspace,
    isolationRoot: layout.root,
    timeoutMs,
    network: { mode: 'deny', webSearch: 'disabled' },
    auth: codexApiAuth('codex-secret-abcdefghijklmnop'),
  };
}

function codexApiAuth(apiKey: string) {
  return {
    runner: 'codex', mode: 'api-key',
    payload: { mode: 'api-key', apiKey, source: 'CODEX_API_KEY' },
    knownSecrets: { CODEX_API_KEY: apiKey, OPENAI_API_KEY: apiKey },
  } as const;
}

function chatgptAuth(codexHome: string) {
  return {
    runner: 'codex', mode: 'chatgpt',
    payload: { mode: 'chatgpt', codexHome },
    knownSecrets: {},
  } as const;
}

async function fakeCodex(mode: string, maxOutputBytes?: number) {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-fake-codex-'));
  const script = join(root, 'fake-codex.mjs');
  await writeFile(script, `
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = ${JSON.stringify(root)};
const mode = ${JSON.stringify(mode)};
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('codex-cli 1.2.3'); process.exit(0); }
if (args.includes('--help')) {
  console.log(mode === 'missing-flags' ? '--json --ephemeral' : ${JSON.stringify(REQUIRED_HELP)});
  process.exit(0);
}
if (args[0] === 'login' && args[1] === 'status') {
  writeFileSync(join(root, 'login-status.json'), JSON.stringify({
    codexHome: process.env.CODEX_HOME,
    home: process.env.HOME,
    userprofile: process.env.USERPROFILE,
    codexKey: Boolean(process.env.CODEX_API_KEY),
    openAiKey: Boolean(process.env.OPENAI_API_KEY),
  }));
  if (mode === 'login-unauthenticated') { console.error('not logged in'); process.exit(1); }
  console.log('Logged in using ChatGPT');
  process.exit(0);
}
if (mode === 'strict-rejected' && args.includes('--strict-config')) { console.error('strict config rejected'); process.exit(2); }
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
writeFileSync(join(root, 'prompt.txt'), prompt);
const configs = new Map();
for (let index = 0; index < args.length - 1; index++) {
  if (args[index] !== '-c') continue;
  const entry = args[++index];
  const separator = entry.indexOf('=');
  configs.set(entry.slice(0, separator), entry.slice(separator + 1));
}
const parseConfig = (name, fallback) => {
  const raw = configs.get(name);
  if (raw === undefined) return fallback;
  try { return JSON.parse(raw); } catch { return raw; }
};
const inherit = parseConfig('shell_environment_policy.inherit', 'all');
let childEnv = inherit === 'all' ? { ...process.env } : {};
const ignoreDefaultExcludes = parseConfig('shell_environment_policy.ignore_default_excludes', false);
if (!ignoreDefaultExcludes) {
  for (const key of Object.keys(childEnv)) {
    if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|COOKIE|AUTHORIZATION)/i.test(key)) delete childEnv[key];
  }
}
const include = parseConfig('shell_environment_policy.include_only', []);
if (Array.isArray(include)) childEnv = Object.fromEntries(Object.entries(childEnv).filter(([key]) => include.includes(key)));
const child = spawnSync('node', ['-e', 'process.stdout.write(JSON.stringify({node:true,codex:Boolean(process.env.CODEX_API_KEY),openai:Boolean(process.env.OPENAI_API_KEY),codexHome:Boolean(process.env.CODEX_HOME)}))'], { env: childEnv, encoding: 'utf8' });
const childRecord = JSON.parse(child.stdout || '{}');
writeFileSync(join(root, 'record.json'), JSON.stringify({
  lastArgument: args.at(-1), nodeFound: child.status === 0 && childRecord.node === true,
  childCodexKey: childRecord.codex === true, childOpenAiKey: childRecord.openai === true,
  childCodexHome: childRecord.codexHome === true,
  parentCodexKey: Boolean(process.env.CODEX_API_KEY), parentOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
  arguments: args.join(' '), toolEnvironmentKeys: Object.keys(childEnv).sort(),
}));
const secret = process.env.CODEX_API_KEY || '';
if (mode === 'invalid-jsonl') { console.log('{broken'); process.exit(0); }
if (mode === 'missing-final') { console.log(JSON.stringify({type:'thread.started'})); process.exit(0); }
if (mode === 'exit-no-stderr') process.exit(7);
if (mode === 'large-output') { console.log('x'.repeat(4096)); process.exit(0); }
if (mode === 'output-limit-tree') {
  spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(join(root, 'output-child-survived.txt'))}, 'yes'), 500); setInterval(() => {}, 1000);`)}], { stdio: 'ignore' });
  process.stdout.write('x'.repeat(4096));
  setInterval(() => {}, 1000);
}
if (mode === 'leak-stdout') console.log(secret);
if (mode === 'leak-stderr') console.error(secret);
if (mode === 'leak-split') {
  process.stdout.write(secret.slice(0, 12));
  await new Promise((resolve) => setTimeout(resolve, 30));
  process.stdout.write(secret.slice(12) + '\\n');
}
if (mode === 'leak-exit') { console.error('failed: ' + secret); process.exit(9); }
if (mode === 'sandbox-launch-failed') console.error('ERROR windows sandbox: CreateProcessWithLogonW failed: 2');
if (mode === 'timeout-tree') {
  spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(join(root, 'child-survived.txt'))}, 'yes'), 500); setInterval(() => {}, 1000);`)}], { stdio: 'ignore' });
  setInterval(() => {}, 1000);
} else {
  console.log(JSON.stringify({type:'thread.started', model:'fake-model', message: mode === 'leak-jsonl' ? secret : undefined}));
  console.log(JSON.stringify({type:'turn.completed', usage:{input_tokens:10,cached_input_tokens:3,output_tokens:4,reasoning_tokens:2,total_tokens:16}}));
}
`);
  return {
    root,
    script,
    runner: new CodexRunner({ command: process.execPath, commandArgs: [script], maxOutputBytes }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
