import test from 'node:test';
import assert from 'node:assert/strict';
import { tarEntryMatchesIncludePath } from '../fetch/tarball.js';

test('GitHub subpath extraction excludes unrelated repository entries and links', () => {
  const prefix = 'web-design-guidelines';
  assert.equal(tarEntryMatchesIncludePath('owner-repo/CLAUDE.md', 1, prefix), false);
  assert.equal(tarEntryMatchesIncludePath('owner-repo/AGENTS.md', 1, prefix), false);
  assert.equal(tarEntryMatchesIncludePath('owner-repo/web-design-guidelines/SKILL.md', 1, prefix), true);
  assert.equal(tarEntryMatchesIncludePath('owner-repo/web-design-guidelines/references/checks.md', 1, prefix), true);
  assert.equal(tarEntryMatchesIncludePath('owner-repo/other/SKILL.md', 1, prefix), false);
  assert.equal(tarEntryMatchesIncludePath('owner-repo/web-design-guidelines/SKILL.md', 1, '../escape'), false);
});
