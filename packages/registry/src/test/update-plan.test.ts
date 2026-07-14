import test from 'node:test';
import assert from 'node:assert/strict';
import type { ResolvedSource, SkillLockfile } from '@skillctl/core';
import { planUpdates } from '../update-plan.js';

const lock: SkillLockfile = {
  lockfileVersion: '1.0',
  skills: {
    demo: {
      name: 'demo', specifier: 'npm:demo@^1.0.0', resolved: 'npm:demo@1.0.0', integrity: `sha256:${'a'.repeat(64)}`,
      canonicalPath: '.skillctl/skills/demo', fetchedAt: new Date(0).toISOString(),
      provenance: { type: 'npm', version: '1.0.0', tarballHash: 'sha512-old', requestedRef: '^1.0.0' },
    },
  },
};

test('plans an exact saved npm update with --latest', async () => {
  const manager = {
    async resolve(): Promise<ResolvedSource> {
      return { name: 'demo', resolved: 'npm:demo@2.0.0', sourceType: 'npm', sourceId: 'npm', originalSpec: 'npm:demo@latest', ref: '2.0.0' };
    },
  } as any;
  const [candidate] = await planUpdates(lock, { agentSkills: { dependencies: { demo: 'npm:demo@^1.0.0' } } }, { latest: true, manager });
  assert.equal(candidate.status, 'outdated');
  assert.equal(candidate.kind, 'major');
  assert.deepEqual(candidate.manifestChange, { before: 'npm:demo@^1.0.0', after: 'npm:demo@2.0.0' });
});

test('does not query exact npm specs without --latest', async () => {
  const exact = structuredClone(lock);
  exact.skills.demo.specifier = 'npm:demo@1.0.0';
  const manager = { resolve: async () => { throw new Error('must not resolve'); } } as any;
  const [candidate] = await planUpdates(exact, null, { manager });
  assert.equal(candidate.status, 'current');
});
