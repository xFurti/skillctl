import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LinkManager } from '@leogriel/link-manager';
import { scanCoexistence } from '../index.js';

test('coexistence scan ignores Leogriel-managed targets but reports unmanaged skills', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-coexistence-'));
  const canonical = join(root, '.leogriel', 'skills', 'managed');
  const managedTarget = join(root, '.agents', 'skills', 'managed');
  const unmanagedTarget = join(root, '.agents', 'skills', 'external');
  try {
    await mkdir(canonical, { recursive: true });
    await writeFile(join(canonical, 'SKILL.md'), '---\nname: managed\ndescription: managed\n---\n');
    await new LinkManager().ensureLink(canonical, managedTarget, { mode: 'copy', relative: true });

    const managedOnly = await scanCoexistence(root);
    assert.equal(managedOnly.details.some((detail) => detail.includes('.agents/skills')), false);
    assert.equal(managedOnly.recommendations.some((item) => item.includes('leogriel import --dry-run')), false);
    assert.equal(managedOnly.recommendations.some((item) => item.includes('import from-npx')), false);

    await mkdir(unmanagedTarget, { recursive: true });
    await writeFile(join(unmanagedTarget, 'SKILL.md'), '---\nname: external\ndescription: external\n---\n');
    const withExternal = await scanCoexistence(root);
    assert.equal(withExternal.details.some((detail) => detail.includes('.agents/skills with 1 skill')), true);
    assert.equal(withExternal.recommendations.some((item) => item.includes('leogriel import --dry-run')), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
