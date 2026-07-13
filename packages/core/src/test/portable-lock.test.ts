import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPortableSpecifier,
  isPortableCanonicalPath,
  findPortablePathWarnings,
  findLockReproducibilityWarnings,
  formatCanonicalPathForLock,
} from '../index.js';

test('isPortableSpecifier accepts remote and project-relative forms', () => {
  assert.equal(isPortableSpecifier('github:foo/bar'), true);
  assert.equal(isPortableSpecifier('file:./skills/foo'), true);
  assert.equal(isPortableSpecifier('local:imported/my-skill'), true);
  assert.equal(isPortableSpecifier('file:/Users/me/skill'), false);
  assert.equal(isPortableSpecifier('local:/Users/me/skill'), false);
});

test('findLockReproducibilityWarnings distinguishes pinned and legacy entries', () => {
  const sha = 'a'.repeat(40);
  const warnings = findLockReproducibilityWarnings({
    lockfileVersion: '1.0',
    skills: {
      pinned: {
        specifier: 'github:owner/repo@main#skills/pinned',
        resolved: `github:owner/repo@${sha}#skills/pinned`,
        integrity: `sha256:${'b'.repeat(64)}`,
        name: 'pinned',
        canonicalPath: '~/.skillctl/skills/pinned',
        fetchedAt: '2026-01-01T00:00:00.000Z',
        provenance: { type: 'github', commit: sha },
      },
      legacy: {
        specifier: 'github:owner/repo@main#skills/legacy',
        resolved: 'github:owner/repo@main#skills/legacy',
        integrity: `sha256:${'c'.repeat(64)}`,
        name: 'legacy',
        canonicalPath: '~/.skillctl/skills/legacy',
        fetchedAt: '2026-01-01T00:00:00.000Z',
        provenance: { type: 'github', requestedRef: 'main' },
      },
      imported: {
        specifier: 'local:imported/imported',
        resolved: 'local:imported/imported',
        integrity: `sha256:${'d'.repeat(64)}`,
        name: 'imported',
        canonicalPath: '~/.skillctl/skills/imported',
        fetchedAt: '2026-01-01T00:00:00.000Z',
        provenance: { type: 'local' },
      },
    },
  });
  assert.deepEqual(warnings.map((warning) => warning.split(':', 1)[0]), [
    'mutable-resolution',
    'non-reproducible-local',
  ]);
});

test('isPortableCanonicalPath accepts project and global store paths', () => {
  assert.equal(isPortableCanonicalPath(formatCanonicalPathForLock('demo')), true);
  assert.equal(isPortableCanonicalPath(formatCanonicalPathForLock('demo', 'global')), true);
  assert.equal(isPortableCanonicalPath('/Users/me/.skillctl/skills/demo'), false);
});

test('findPortablePathWarnings flags legacy lock entries', () => {
  const warnings = findPortablePathWarnings({
    lockfileVersion: '1.0',
    skills: {
      demo: {
        specifier: 'file:/Users/me/project/skill',
        resolved: 'local:/Users/me/project/skill',
        integrity: 'sha256:abc',
        name: 'demo',
        canonicalPath: '/Users/me/.skillctl/skills/demo',
        fetchedAt: '2026-01-01T00:00:00.000Z',
        provenance: { type: 'local' },
      },
    },
  });
  assert.equal(warnings.length, 3);
});
