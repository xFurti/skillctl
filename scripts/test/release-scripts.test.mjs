import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractReleaseNotes } from '../extract-release-notes.mjs';
import { npmInvocation, publicationDecision, resolveDistTag, tarballIntegrity } from '../publish-release.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('extracts one changelog release section', () => {
  const changelog = '# Changelog\n\n## [0.7.0] - 2026-07-14\n\n### Added\n\n- Search.\n\n## [0.6.1] - 2026-07-13\n\n- Fix.';
  assert.equal(extractReleaseNotes(changelog, '0.7.0'), '### Added\n\n- Search.');
});

test('publication decisions are idempotent and reject conflicts', () => {
  assert.equal(publicationDecision('sha512-a', null), 'publish');
  assert.equal(publicationDecision('sha512-a', 'sha512-a'), 'skip');
  assert.equal(publicationDecision('sha512-a', 'sha512-b'), 'conflict');
  assert.match(tarballIntegrity(Buffer.from('archive')), /^sha512-/);
  assert.equal(resolveDistTag('1.2.3'), 'latest');
  assert.equal(resolveDistTag('1.2.3-beta.1'), 'next');
  assert.equal(resolveDistTag('1.2.3-beta.1', 'beta'), 'beta');
  assert.throws(() => resolveDistTag('1.2.3', '1.2.3'), /cannot be a version/);
});

test('release publishing invokes the npm CLI through Node on Windows', () => {
  const windows = npmInvocation(['view', '@leogriel/core'], {
    platform: 'win32',
    execPath: 'C:\\Node\\node.exe',
  });
  assert.equal(windows.command, 'C:\\Node\\node.exe');
  assert.match(windows.args[0], /node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/);
  assert.deepEqual(windows.args.slice(1), ['view', '@leogriel/core']);

  assert.deepEqual(
    npmInvocation(['publish', 'archive.tgz'], { platform: 'linux', execPath: '/usr/bin/node' }),
    { command: 'npm', args: ['publish', 'archive.tgz'] },
  );
});

test('workspace packages do not force provenance outside trusted publishing', async () => {
  const testingPackage = JSON.parse(await readFile(join(root, 'packages', 'testing', 'package.json'), 'utf8'));
  assert.equal(testingPackage.publishConfig.access, 'public');
  assert.equal(testingPackage.publishConfig.provenance, undefined);
});
