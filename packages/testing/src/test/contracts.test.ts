import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  caseVerdict, countSnapshotChanges, createIsolation, destroyIsolation, evaluateAssertions, isolatedEnvironment,
  resolveClaudeAuth, resolveCodexAuth, resolveFixturePath, runSkillTests, skillVerdict, snapshotWorkspace, validateFixture, validateTestFile,
  type AgentRunner, type CaseResult,
} from '../index.js';

test('test YAML defaults to denied network and disabled web search', () => {
  const parsed = validateTestFile({ version: 1, skill: 'demo', cases: [{ name: 'case', prompt: 'work', assertions: [{ type: 'file-exists', path: 'out' }] }] });
  assert.deepEqual(parsed.cases[0].network, { mode: 'deny', webSearch: 'disabled' });
  assert.throws(() => validateTestFile({ version: 1, skill: 'demo', cases: [{ name: 'case', prompt: 'work', network: { mode: 'open' }, assertions: [{ type: 'file-exists' }] }] }), /network.mode/);
});

test('test YAML validates unique cases, limits, budgets, runners, and assertion-specific fields', () => {
  const assertion = (value: Record<string, unknown>) => ({ version: 1, skill: 'demo', cases: [{ name: 'case', prompt: 'work', assertions: [value] }] });
  assert.throws(() => validateTestFile({ version: 1, skill: 'demo', cases: [
    { name: 'same', prompt: 'a', assertions: [{ type: 'file-exists', path: 'a' }] },
    { name: 'same', prompt: 'b', assertions: [{ type: 'file-exists', path: 'b' }] },
  ] }), /Duplicate case name/);
  assert.throws(() => validateTestFile({ version: 1, skill: 'demo', cases: [{ name: 'case', prompt: 'work', timeout: 0, assertions: [{ type: 'file-exists', path: 'a' }] }] }), /positive integer/);
  assert.throws(() => validateTestFile({ version: 1, skill: 'demo', cases: [{ name: 'case', prompt: 'work', budget: { maxTokens: -1 }, assertions: [{ type: 'file-exists', path: 'a' }] }] }), /non-negative integer/);
  assert.throws(() => validateTestFile({ version: 1, skill: 'demo', cases: [{ name: 'case', prompt: 'work', runner: { id: 1 }, assertions: [{ type: 'file-exists', path: 'a' }] }] }), /runner.id/);
  for (const type of ['file-exists', 'file-not-exists', 'file-contains', 'file-not-contains', 'regex', 'json-schema', 'snapshot', 'forbidden-path']) {
    assert.throws(() => validateTestFile(assertion({ type })), /requires path/);
  }
  assert.throws(() => validateTestFile(assertion({ type: 'file-contains', path: 'a' })), /requires contains/);
  assert.throws(() => validateTestFile(assertion({ type: 'regex', path: 'a', pattern: '[' })), /pattern is invalid/);
  assert.throws(() => validateTestFile(assertion({ type: 'command', executable: 'node' })), /requires argv/);
  assert.throws(() => validateTestFile(assertion({ type: 'command', executable: 'node', argv: [1] })), /requires argv/);
  assert.throws(() => validateTestFile(assertion({ type: 'max-changed-files', max: -1 })), /non-negative max/);
});

test('fixtures reject undeclared agent configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testing-fixture-'));
  try {
    await writeFile(join(root, 'AGENTS.md'), 'hidden rules');
    await assert.rejects(validateFixture(root), /undeclared agent configuration/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fixture paths reject traversal, absolute paths, and symlinks before copying', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testing-fixture-path-'));
  const project = join(root, 'project');
  const tests = join(project, 'tests');
  const fixture = join(project, 'fixture');
  const outside = join(root, 'outside');
  try {
    await Promise.all([mkdir(tests, { recursive: true }), mkdir(fixture, { recursive: true }), mkdir(outside, { recursive: true })]);
    const testPath = join(tests, 'test.yaml');
    await writeFile(testPath, 'test');
    await assert.rejects(resolveFixturePath(testPath, '../fixture', project), /cannot contain/);
    await assert.rejects(resolveFixturePath(testPath, outside, project), /project-relative/);
    const linked = join(project, 'linked');
    await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(resolveFixturePath(testPath, '../linked', project), /cannot contain/);
    await symlink(outside, join(fixture, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(validateFixture(fixture), /symbolic link/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('workspace snapshots count modifications to existing files deterministically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testing-snapshot-'));
  try {
    await writeFile(join(root, 'existing.txt'), 'before');
    const before = await snapshotWorkspace(root);
    await writeFile(join(root, 'existing.txt'), 'after');
    await mkdir(join(root, '.git'));
    await mkdir(join(root, '.agents'));
    const after = await snapshotWorkspace(root);
    assert.equal(countSnapshotChanges(before, after), 1);
    assert.deepEqual([...after.keys()], [...after.keys()].sort());
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('timed-out command assertions terminate their complete process tree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testing-command-tree-'));
  const marker = join(root, 'child-survived.txt');
  const childCode = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'yes'), 500); setInterval(() => {}, 1000);`;
  const parentCode = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], {stdio:'ignore'}); setInterval(() => {}, 1000);`;
  try {
    const snapshot = await snapshotWorkspace(root);
    const [result] = await evaluateAssertions(
      [{ type: 'command', executable: process.execPath, argv: ['-e', parentCode] }],
      root,
      snapshot,
      { timeoutMs: 150, environment: process.env },
    );
    assert.equal(result.passed, false);
    assert.match(result.message, /timed out/);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await assert.rejects(readFile(marker));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('each isolation uses separate HOME, XDG, USERPROFILE, CODEX_HOME, and CLAUDE_CONFIG_DIR trees', async () => {
  const one = await createIsolation();
  const two = await createIsolation();
  try {
    assert.notEqual(one.root, two.root);
    assert.equal(new Set([one.home, one.userprofile, one.xdgConfig, one.xdgData, one.xdgCache, one.codexHome, one.claudeHome]).size, 7);
    const environment = isolatedEnvironment(one);
    assert.equal(environment.CODEX_API_KEY, undefined);
    assert.equal(environment.OPENAI_API_KEY, undefined);
    assert.equal(environment.ANTHROPIC_API_KEY, undefined);
    assert.equal(environment.CLAUDE_CONFIG_DIR, one.claudeHome);
  } finally { await destroyIsolation(one); await destroyIsolation(two); }
});

test('Codex authentication applies precedence and rejects conflicting keys', () => {
  assert.deepEqual(resolveCodexAuth({ CODEX_API_KEY: 'abcdefghijklmnop' }), { mode: 'api-key', apiKey: 'abcdefghijklmnop', source: 'CODEX_API_KEY' });
  assert.deepEqual(resolveCodexAuth({ OPENAI_API_KEY: 'abcdefghijklmnop' }), { mode: 'api-key', apiKey: 'abcdefghijklmnop', source: 'OPENAI_API_KEY' });
  assert.deepEqual(resolveCodexAuth({ CODEX_API_KEY: 'abcdefghijklmnop', OPENAI_API_KEY: 'abcdefghijklmnop' }), { mode: 'api-key', apiKey: 'abcdefghijklmnop', source: 'CODEX_API_KEY' });
  assert.throws(() => resolveCodexAuth({ CODEX_API_KEY: 'abcdefghijklmnop', OPENAI_API_KEY: 'different-secret-value' }), /different values/);
});

test('Claude authentication requires one sufficiently long API key', () => {
  assert.deepEqual(resolveClaudeAuth({ ANTHROPIC_API_KEY: 'abcdefghijklmnop' }), {
    mode: 'api-key', apiKey: 'abcdefghijklmnop', source: 'ANTHROPIC_API_KEY',
  });
  assert.throws(() => resolveClaudeAuth({}), /requires ANTHROPIC_API_KEY/);
  assert.throws(() => resolveClaudeAuth({ ANTHROPIC_API_KEY: 'short' }), /too short/);
});

test('ChatGPT authentication requires an explicit dedicated home and rejects API keys', () => {
  const resolved = resolveCodexAuth({
    LEOGRIEL_CODEX_AUTH_MODE: 'chatgpt',
    LEOGRIEL_CODEX_AUTH_HOME: './dedicated-chatgpt-profile',
  });
  assert.equal(resolved.mode, 'chatgpt');
  if (resolved.mode === 'chatgpt') assert.equal(resolved.codexHome.endsWith('dedicated-chatgpt-profile'), true);
  assert.throws(() => resolveCodexAuth({ LEOGRIEL_CODEX_AUTH_MODE: 'chatgpt' }), /explicit LEOGRIEL_CODEX_AUTH_HOME/);
  assert.throws(() => resolveCodexAuth({
    LEOGRIEL_CODEX_AUTH_MODE: 'chatgpt',
    LEOGRIEL_CODEX_AUTH_HOME: './profile',
    CODEX_API_KEY: 'abcdefghijklmnop',
  }), /cannot be combined/);
  assert.throws(() => resolveCodexAuth({
    LEOGRIEL_CODEX_AUTH_MODE: 'chatgpt',
    LEOGRIEL_CODEX_AUTH_HOME: './profile',
    OPENAI_API_KEY: 'abcdefghijklmnop',
  }), /cannot be combined/);
  assert.throws(() => resolveCodexAuth({ LEOGRIEL_CODEX_AUTH_MODE: 'unknown' }), /api-key or chatgpt/);
});

test('aggregate verdict follows case verdicts instead of assertion counts', () => {
  const base = { name: 'case', prompt: 'work', network: { mode: 'deny', webSearch: 'disabled' }, baselinePassRate: 0, skillPassRate: 1, pairs: [] };
  assert.equal(skillVerdict([{ ...base, verdict: 'improved' }] as CaseResult[], 0, 1), 'improved');
  assert.equal(skillVerdict([{ ...base, verdict: 'improved' }, { ...base, verdict: 'regressed' }] as CaseResult[], 0.5, 0.5), 'inconclusive');
});

test('paired verdicts require two one-directional transitions and reject mixed or incomplete results', () => {
  const variant = (passed: boolean) => ({ passed }) as never;
  const pairs = (values: Array<[boolean, boolean]>) => values.map(([baseline, skill], run) => ({
    run, first: 'baseline' as const, baseline: variant(baseline), skill: variant(skill),
  }));
  assert.equal(caseVerdict(pairs([[false, true], [false, true]]), false), 'improved');
  assert.equal(caseVerdict(pairs([[true, false], [true, false]]), false), 'regressed');
  assert.equal(caseVerdict(pairs([[false, true]]), false), 'inconclusive');
  assert.equal(caseVerdict(pairs([[false, true], [true, false]]), false), 'inconclusive');
  assert.equal(caseVerdict(pairs([[true, true], [false, false]]), false), 'unchanged');
  assert.equal(caseVerdict(pairs([[false, true], [false, true]]), true), 'inconclusive');
});

test('paired runner execution is sequential, deterministic, and records model/network metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testing-paired-'));
  const skill = join(root, 'skill');
  const previous = process.env.CODEX_API_KEY;
  process.env.CODEX_API_KEY = 'test-secret-abcdefghijklmnop';
  let active = 0;
  let maxActive = 0;
  const roots = new Set<string>();
  const runner: AgentRunner = {
    id: 'fake',
    resolveAuth: () => fakeAuth('fake'),
    detect: async () => ({ available: true, version: '1.0', capabilities: ['isolated-home-directories'] }),
    run: async (request) => {
      active++;
      maxActive = Math.max(maxActive, active);
      roots.add(request.isolationRoot);
      await writeFile(join(request.workspace, 'output.txt'), 'ready');
      active--;
      return { ok: true, exitCode: 0, durationMs: 1, requestedModel: request.requestedModel || null, resolvedModel: 'fixture-model', output: '' };
    },
  };
  try {
    await mkdir(skill);
    await writeFile(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: test\n---\nwork');
    const file = validateTestFile({ version: 1, skill: 'demo', cases: [{ name: 'case', prompt: 'work', assertions: [{ type: 'file-exists', path: 'output.txt' }] }] });
    await assert.rejects(runSkillTests({ ...file, skill: 'other' }, { testFilePath: join(root, 'test.yaml'), skillPath: skill, runner, leogrielVersion: '0.9.0' }), /does not match/);
    const wrongRunner = validateTestFile({ version: 1, skill: 'demo', cases: [{ name: 'case', prompt: 'work', runner: { id: 'other' }, assertions: [{ type: 'file-exists', path: 'output.txt' }] }] });
    await assert.rejects(runSkillTests(wrongRunner, { testFilePath: join(root, 'test.yaml'), skillPath: skill, runner, leogrielVersion: '0.9.0' }), /requires runner/);
    await assert.rejects(runSkillTests(file, { testFilePath: join(root, 'test.yaml'), skillPath: skill, runner, runs: 0, leogrielVersion: '0.9.0' }), /between 1 and 20/);
    await assert.rejects(runSkillTests(file, { testFilePath: join(root, 'test.yaml'), skillPath: skill, runner, runs: 21, leogrielVersion: '0.9.0' }), /between 1 and 20/);
    const result = await runSkillTests(file, { testFilePath: join(root, 'test.yaml'), skillPath: skill, runner, runs: 3, seed: 7, leogrielVersion: '0.9.0' });
    assert.equal(maxActive, 1);
    assert.equal(roots.size, 6);
    assert.deepEqual(result.cases[0].pairs.map((pair) => pair.first), ['skill', 'baseline', 'skill']);
    assert.equal(result.verdict, 'unchanged');
    assert.deepEqual(result.resolvedModels, ['fixture-model']);
    assert.deepEqual(result.cases[0].pairs[0].skill.network, { mode: 'deny', webSearch: 'disabled' });
    assert.match(result.skillMetadata.integrity, /^sha256:/);
  } finally {
    if (previous === undefined) delete process.env.CODEX_API_KEY; else process.env.CODEX_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('derived seed covers test and skill integrity, runner, model, and run count while run IDs stay unique', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testing-seed-'));
  const skill = join(root, 'skill');
  const previous = process.env.CODEX_API_KEY;
  process.env.CODEX_API_KEY = 'test-secret-abcdefghijklmnop';
  const makeRunner = (id: string): AgentRunner => ({
    id,
    resolveAuth: () => fakeAuth(id),
    detect: async () => ({ available: true, capabilities: [] }),
    run: async (request) => ({ ok: true, exitCode: 0, durationMs: 1, requestedModel: request.requestedModel || null, output: '' }),
  });
  const baseInput = { version: 1 as const, skill: 'demo', cases: [{ name: 'case', prompt: 'work', assertions: [{ type: 'file-not-exists' as const, path: 'output.txt' }] }] };
  try {
    await mkdir(skill);
    const originalSkill = '---\nname: demo\ndescription: test\n---\nwork';
    await writeFile(join(skill, 'SKILL.md'), originalSkill);
    const execute = (input = baseInput, runner = makeRunner('fake'), extra: Partial<Parameters<typeof runSkillTests>[1]> = {}) => runSkillTests(
      validateTestFile(input),
      { testFilePath: join(root, 'missing.yaml'), skillPath: skill, runner, runs: 1, leogrielVersion: '0.9.0', ...extra },
    );
    const base = await execute();
    const same = await execute();
    assert.equal(base.seed, same.seed);
    assert.notEqual(base.runId, same.runId);
    assert.notEqual((await execute({ ...baseInput, cases: [{ ...baseInput.cases[0], prompt: 'changed' }] })).seed, base.seed);
    await writeFile(join(skill, 'SKILL.md'), `${originalSkill}\nchanged`);
    assert.notEqual((await execute()).seed, base.seed);
    await writeFile(join(skill, 'SKILL.md'), originalSkill);
    assert.notEqual((await execute(baseInput, makeRunner('other'))).seed, base.seed);
    assert.notEqual((await execute(baseInput, makeRunner('fake'), { model: 'fixed-model' })).seed, base.seed);
    assert.notEqual((await execute(baseInput, makeRunner('fake'), { runs: 2 })).seed, base.seed);
  } finally {
    if (previous === undefined) delete process.env.CODEX_API_KEY; else process.env.CODEX_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('git comparison installs the reference skill as the paired baseline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testing-compare-'));
  const reference = join(root, 'reference');
  const candidate = join(root, 'candidate');
  const previous = process.env.CODEX_API_KEY;
  process.env.CODEX_API_KEY = 'test-secret-abcdefghijklmnop';
  const runner: AgentRunner = {
    id: 'fake',
    resolveAuth: () => fakeAuth('fake'),
    detect: async () => ({ available: true, capabilities: [] }),
    run: async (request) => {
      const installed = await readFile(join(request.workspace, '.codex', 'skills', 'demo', 'SKILL.md'), 'utf8');
      if (installed.includes('candidate')) await writeFile(join(request.workspace, 'output.txt'), 'ready');
      return { ok: true, exitCode: 0, durationMs: 1, requestedModel: null, output: '' };
    },
  };
  try {
    await Promise.all([mkdir(reference), mkdir(candidate)]);
    await writeFile(join(reference, 'SKILL.md'), '---\nname: demo\ndescription: reference\n---\nreference');
    await writeFile(join(candidate, 'SKILL.md'), '---\nname: demo\ndescription: candidate\n---\ncandidate');
    const file = validateTestFile({
      version: 1,
      skill: 'demo',
      cases: [{ name: 'case', prompt: 'work', assertions: [{ type: 'file-exists', path: 'output.txt' }] }],
    });
    const result = await runSkillTests(file, {
      testFilePath: join(root, 'test.yaml'),
      skillPath: candidate,
      comparison: { requestedRef: 'main', commit: 'a'.repeat(40), skillPath: reference },
      runner,
      runs: 2,
      leogrielVersion: '1.0.0-beta.2',
    });
    assert.equal(result.verdict, 'improved');
    assert.equal(result.baselinePassRate, 0);
    assert.equal(result.skillPassRate, 1);
    assert.equal(result.comparison?.requestedRef, 'main');
    assert.equal(result.comparison?.commit, 'a'.repeat(40));
    assert.notEqual(result.comparison?.referenceIntegrity, result.comparison?.candidateIntegrity);
  } finally {
    if (previous === undefined) delete process.env.CODEX_API_KEY; else process.env.CODEX_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

function fakeAuth(runner: string) {
  return { runner, mode: 'none', payload: {}, knownSecrets: {} };
}
