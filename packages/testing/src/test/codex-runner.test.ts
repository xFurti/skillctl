import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CodexRunner, createIsolation, destroyIsolation, runProcess, runSkillTests, validateTestFile,
  type AgentRunRequest,
} from '../index.js';

const REQUIRED_HELP = '--json --ephemeral --ignore-user-config --ignore-rules --sandbox --strict-config --skip-git-repo-check';

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
  const root = await mkdtemp(join(tmpdir(), 'skillctl-strict-verdict-'));
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
      skillctlVersion: '0.9.0',
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
    assert.equal(recorded.parentCodexKey, true);
    assert.equal(recorded.parentOpenAiKey, false);
    assert.match(String(recorded.arguments), /shell_environment_policy\.inherit="all"/);
    assert.match(String(recorded.arguments), /shell_environment_policy\.ignore_default_excludes=false/);
    assert.match(String(recorded.arguments), /PATH/);
    assert.doesNotMatch(String(recorded.arguments), /CODEX_API_KEY|OPENAI_API_KEY/);
    assert.deepEqual(result.tokenUsage, { input: 10, cachedInput: 3, output: 4, reasoning: 2, total: 16 });
    assert.equal(result.resolvedModel, 'fake-model');
  } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
});

test('Codex redacts secrets from stdout, stderr, split chunks, JSONL, and nonzero errors', async () => {
  const secret = 'codex-secret-abcdefghijklmnop';
  for (const mode of ['leak-stdout', 'leak-stderr', 'leak-split', 'leak-jsonl', 'leak-exit']) {
    const fixture = await fakeCodex(mode);
    const isolation = await createIsolation();
    try {
      const result = await fixture.runner.run(request(isolation, 'prompt', 2_000));
      assert.doesNotMatch(result.output, new RegExp(secret), `${mode} output`);
      assert.doesNotMatch(result.error || '', new RegExp(secret), `${mode} error`);
      if (mode !== 'leak-stderr') assert.match(`${result.output}\n${result.error || ''}`, /REDACTED/, mode);
      else {
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
    auth: { apiKey: 'codex-secret-abcdefghijklmnop' },
  };
}

async function fakeCodex(mode: string, maxOutputBytes?: number) {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-fake-codex-'));
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
const child = spawnSync('node', ['-e', 'process.stdout.write(JSON.stringify({node:true,codex:Boolean(process.env.CODEX_API_KEY),openai:Boolean(process.env.OPENAI_API_KEY)}))'], { env: childEnv, encoding: 'utf8' });
const childRecord = JSON.parse(child.stdout || '{}');
writeFileSync(join(root, 'record.json'), JSON.stringify({
  lastArgument: args.at(-1), nodeFound: child.status === 0 && childRecord.node === true,
  childCodexKey: childRecord.codex === true, childOpenAiKey: childRecord.openai === true,
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
