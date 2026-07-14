import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import {
  CodexRunner,
  createIsolation,
  destroyIsolation,
  evaluateAssertions,
  isolatedEnvironment,
  resolveCodexAuth,
  snapshotWorkspace,
} from '../index.js';

const enabled = process.env.SKILLCTL_LIVE_CODEX === '1';

test('live Codex creates the requested file with network disabled', { skip: !enabled }, async () => {
  const model = process.env.SKILLCTL_LIVE_MODEL;
  assert.ok(model, 'SKILLCTL_LIVE_MODEL must contain one exact Codex model ID');
  const isolation = await createIsolation();
  try {
    assert.deepEqual(await readdir(isolation.workspace), []);
    const initial = await snapshotWorkspace(isolation.workspace);
    const runner = new CodexRunner();
    const result = await runner.run({
      prompt: [
        'Create output.txt containing exactly: skillctl-live-smoke',
        'Then directly execute Node.js with this command:',
        'node -e "require(\'node:fs\').writeFileSync(\'node-proof.txt\', process.version)"',
        'Do not calculate, infer, or manually type the Node.js version.',
      ].join('\n'),
      workspace: isolation.workspace,
      isolationRoot: isolation.root,
      timeoutMs: 120_000,
      network: { mode: 'deny', webSearch: 'disabled' },
      requestedModel: model,
      auth: resolveCodexAuth(),
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.requestedModel, model);
    const fileAssertions = await evaluateAssertions([
      { type: 'file-exists', path: 'output.txt' },
      { type: 'file-contains', path: 'output.txt', contains: 'skillctl-live-smoke' },
    ], isolation.workspace, initial, { timeoutMs: 10_000, environment: isolatedEnvironment(isolation) });
    assert.equal(fileAssertions.every((item) => item.passed), true, JSON.stringify(fileAssertions));
    assert.equal(await readFile(`${isolation.workspace}/node-proof.txt`, 'utf8'), process.version);
  } finally {
    await destroyIsolation(isolation);
    await assert.rejects(access(isolation.root));
  }
});
