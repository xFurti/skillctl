/**
 * Tests for PR6 adapters: detect + ensureTarget/remove (using LinkManager under the hood).
 * Uses temp dirs for project/global simulation + mocks via temp fs (no real ~).
 * Covers claude, cursor, opencode + coexistence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  claudeAdapter,
  cursorAdapter,
  opencodeAdapter,
  grokAdapter,
  scanCoexistence,
  syncSkillsToAgents,
} from '../index.js';

async function runTests() {
  console.log('Running PR6 adapter detect + ensure tests...');

  const tmp = await mkdtemp(join(tmpdir(), 'skillctl-adapters-test-'));
  const originalStore = process.env.SKILLCTL_STORE;
  process.env.SKILLCTL_STORE = join(tmp, 'canonical');
  const projectDir = join(tmp, 'project');
  await mkdir(projectDir, { recursive: true });

  let origCwd: any = process.cwd;

  try {
    // --- Detect tests (basic + marker) ---
    // claude
    await mkdir(join(projectDir, '.claude', 'skills'), { recursive: true });
    // cd simulation: adapters use process.cwd()
    origCwd = process.cwd;
    process.cwd = () => projectDir as any;
    assert.strictEqual(await claudeAdapter.detect(), true, 'claude should detect .claude');
    await rm(join(projectDir, '.claude'), { recursive: true, force: true });

    // cursor
    await mkdir(join(projectDir, '.agents', 'skills'), { recursive: true });
    assert.strictEqual(await cursorAdapter.detect(), true, 'cursor detects .agents/skills');
    await rm(join(projectDir, '.agents'), { recursive: true, force: true });

    // opencode
    await mkdir(join(projectDir, '.opencode'), { recursive: true });
    assert.strictEqual(await opencodeAdapter.detect(), true, 'opencode detects .opencode');
    await rm(join(projectDir, '.opencode'), { recursive: true, force: true });

    // grok
    await mkdir(join(projectDir, '.grok', 'skills'), { recursive: true });
    assert.strictEqual(await grokAdapter.detect(), true, 'grok detects .grok/skills');
    await rm(join(projectDir, '.grok'), { recursive: true, force: true });

    // restore temp for next section
    process.cwd = origCwd;

    // --- Coexistence scan stub ---
    await mkdir(join(projectDir, '.agents', 'skills'), { recursive: true });
    await writeFile(join(projectDir, 'skills-lock.json'), '{}');
    const coexist = await scanCoexistence(projectDir);
    assert.ok(coexist.detected, 'coexistence should detect .agents + lock');
    assert.ok(coexist.details.some((d) => d.includes('.agents/skills')));
    assert.ok(coexist.details.some((d) => d.includes('skills-lock.json')));
    await rm(join(projectDir, '.agents'), { recursive: true, force: true });
    await rm(join(projectDir, 'skills-lock.json'), { force: true });

    // --- Ensure + remove using LinkManager (real fs in tmp) ---
    // Simulate canonical skill
    const canonical = join(tmp, 'canonical', 'demo-skill');
    await mkdir(join(canonical), { recursive: true });
    await writeFile(join(canonical, 'SKILL.md'), '---\nname: demo-skill\n---\nDemo');

    // Use claude adapter ensure with project path resolved
    const claudeSkillsRoot = join(projectDir, '.claude', 'skills');
    const targetForSkill = join(claudeSkillsRoot, 'demo-skill');

    // call ensureTarget (adapters append? no, we pass full target)
    await claudeAdapter.ensureTarget('demo-skill', targetForSkill, canonical, 'copy'); // use copy for test reliability (no symlink perms)

    // verify created
    const tstat = await stat(targetForSkill);
    assert.ok(tstat.isDirectory(), 'target skill dir created by ensure');

    // verify contents via link or copy
    const skillMd = join(targetForSkill, 'SKILL.md');
    const sstat = await stat(skillMd);
    assert.ok(sstat.isFile());

    // removeTarget
    await claudeAdapter.removeTarget('demo-skill', targetForSkill, canonical);
    try {
      await stat(targetForSkill);
      assert.fail('target should be removed');
    } catch (e: any) {
      assert.ok(e.code === 'ENOENT' || e.code === 'ENOTDIR');
    }

    // Test via syncSkillsToAgents (wiring)
    const fakeCanonical2 = join(tmp, 'canonical', 'sync-skill');
    await mkdir(fakeCanonical2, { recursive: true });
    await writeFile(join(fakeCanonical2, 'SKILL.md'), 'sync test');

    // override cwd again
    process.cwd = () => projectDir as any;
    const res = await syncSkillsToAgents(
      [{ name: 'sync-skill', canonicalPath: fakeCanonical2 }],
      { mode: 'copy', scope: 'project', adapters: [claudeAdapter] } // pass explicit to avoid detect skip
    );
    assert.ok(res.synced >= 1, 'sync should ensure at least one');
    assert.ok(res.adaptersUsed.includes('claude-code'));

    const dryRunTarget = join(projectDir, '.claude', 'skills', 'dry-run-skill');
    const dryRunCanonical = join(tmp, 'canonical', 'dry-run-skill');
    await mkdir(dryRunCanonical, { recursive: true });
    await writeFile(join(dryRunCanonical, 'SKILL.md'), 'dry run');
    await syncSkillsToAgents(
      [{ name: 'dry-run-skill', canonicalPath: dryRunCanonical }],
      { mode: 'copy', scope: 'project', dryRun: true, adapters: [claudeAdapter] }
    );
    await assert.rejects(stat(dryRunTarget), (err: any) => err.code === 'ENOENT');

    if (process.platform !== 'win32') {
      const relCanonical = join(tmp, 'canonical', 'relative-skill');
      await mkdir(relCanonical, { recursive: true });
      await writeFile(join(relCanonical, 'SKILL.md'), 'relative');
      await syncSkillsToAgents(
        [{ name: 'relative-skill', canonicalPath: relCanonical }],
        { mode: 'symlink', scope: 'project', adapters: [claudeAdapter] }
      );
      const relTarget = join(projectDir, '.claude', 'skills', 'relative-skill');
      const { readlink } = await import('node:fs/promises');
      const linkVal = await readlink(relTarget);
      assert.ok(!linkVal.startsWith('/') && !/^[A-Za-z]:/.test(linkVal), 'project link should be relative');
    }

    const staleCanonical = join(tmp, 'canonical', 'stale-skill');
    const staleTarget = join(projectDir, '.claude', 'skills', 'stale-skill');
    await mkdir(staleCanonical, { recursive: true });
    await writeFile(join(staleCanonical, 'SKILL.md'), 'stale');
    await claudeAdapter.ensureTarget('stale-skill', staleTarget, staleCanonical, 'copy');
    const unmanagedTarget = join(projectDir, '.claude', 'skills', 'keep-user-skill');
    await mkdir(unmanagedTarget, { recursive: true });
    await writeFile(join(unmanagedTarget, 'SKILL.md'), 'user managed');

    const pruneResult = await syncSkillsToAgents([], {
      mode: 'copy', scope: 'project', prune: true, adapters: [claudeAdapter],
    });
    assert.ok(pruneResult.counts.pruned >= 2);
    assert.equal(pruneResult.counts.skipped, 1);
    await assert.rejects(stat(staleTarget), (err: any) => err.code === 'ENOENT');
    assert.ok((await stat(unmanagedTarget)).isDirectory());

    const dryPruneCanonical = join(tmp, 'canonical', 'dry-prune');
    const dryPruneTarget = join(projectDir, '.claude', 'skills', 'dry-prune');
    await mkdir(dryPruneCanonical, { recursive: true });
    await writeFile(join(dryPruneCanonical, 'SKILL.md'), 'dry prune');
    await claudeAdapter.ensureTarget('dry-prune', dryPruneTarget, dryPruneCanonical, 'copy');
    const dryPrune = await syncSkillsToAgents([], {
      scope: 'project', prune: true, dryRun: true, adapters: [claudeAdapter],
    });
    assert.ok(dryPrune.counts.pruned >= 1);
    assert.ok((await stat(dryPruneTarget)).isDirectory());

    await assert.rejects(
      syncSkillsToAgents([], { adapterIds: ['missing-adapter'] }),
      /Unknown agent adapter/
    );

    // cleanup created
    await rm(join(projectDir, '.claude'), { recursive: true, force: true });

    console.log('All PR6 adapter detect/ensure/coexistence/sync tests passed.');
  } finally {
    // restore
    process.cwd = origCwd;
    if (originalStore === undefined) delete process.env.SKILLCTL_STORE;
    else process.env.SKILLCTL_STORE = originalStore;
    await rm(tmp, { recursive: true, force: true });
  }
}

test('adapter detection, linking, coexistence, and sync', runTests);

export { runTests };
