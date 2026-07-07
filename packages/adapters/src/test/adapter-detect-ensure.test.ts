/**
 * Tests for PR6 adapters: detect + ensureTarget/remove (using LinkManager under the hood).
 * Uses temp dirs for project/global simulation + mocks via temp fs (no real ~).
 * Covers claude, cursor, opencode + coexistence.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir as realHomedir } from 'node:os';
import {
  claudeAdapter,
  cursorAdapter,
  opencodeAdapter,
  grokAdapter,
  scanCoexistence,
  syncSkillsToAgents,
} from '../index.js';
import { linkManager } from '@skillctl/link-manager';

async function runTests() {
  console.log('Running PR6 adapter detect + ensure tests...');

  const tmp = await mkdtemp(join(tmpdir(), 'skillctl-adapters-test-'));
  const projectDir = join(tmp, 'project');
  const fakeHome = join(tmp, 'fakehome'); // mock homedir for global paths
  await mkdir(projectDir, { recursive: true });
  await mkdir(fakeHome, { recursive: true });

  // Patch homedir for the duration of test (monkey for global paths in adapters)
  let origHomedir: any = (await import('node:os')).homedir;
  // @ts-ignore - replace for test
  (await import('node:os')).homedir = () => fakeHome;

  let origCwd: any = process.cwd;

  try {
    // --- Detect tests (basic + marker) ---
    // claude
    assert.strictEqual(await claudeAdapter.detect(), false, 'claude should not detect empty');
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
    await claudeAdapter.removeTarget('demo-skill', targetForSkill);
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
      { mode: 'copy', adapters: [claudeAdapter] } // pass explicit to avoid detect skip
    );
    assert.ok(res.synced >= 1, 'sync should ensure at least one');
    assert.ok(res.adaptersUsed.includes('claude-code'));

    if (process.platform !== 'win32') {
      const relCanonical = join(tmp, 'canonical', 'relative-skill');
      await mkdir(relCanonical, { recursive: true });
      await writeFile(join(relCanonical, 'SKILL.md'), 'relative');
      await syncSkillsToAgents(
        [{ name: 'relative-skill', canonicalPath: relCanonical }],
        { mode: 'symlink', adapters: [claudeAdapter] }
      );
      const relTarget = join(projectDir, '.claude', 'skills', 'relative-skill');
      const { readlink } = await import('node:fs/promises');
      const linkVal = await readlink(relTarget);
      assert.ok(!linkVal.startsWith('/') && !/^[A-Za-z]:/.test(linkVal), 'project link should be relative');
    }

    // cleanup created
    await rm(join(projectDir, '.claude'), { recursive: true, force: true });

    console.log('All PR6 adapter detect/ensure/coexistence/sync tests passed.');
  } finally {
    // restore
    process.cwd = origCwd;
    // @ts-ignore restore
    (await import('node:os')).homedir = origHomedir;
    await rm(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((e) => { console.error(e); process.exit(1); });
}

export { runTests };
