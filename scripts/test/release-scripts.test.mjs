import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractReleaseNotes, releaseComparison } from '../extract-release-notes.mjs';
import { canonicalPackageJson, npmInvocation, publicationDecision, resolveDistTag, tarballIntegrity } from '../publish-release.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('extracts one changelog release section', () => {
  const changelog = '# Changelog\n\n## [0.7.0] - 2026-07-14\n\n### Added\n\n- Search.\n\n## [0.6.1] - 2026-07-13\n\n- Fix.';
  assert.equal(extractReleaseNotes(changelog, '0.7.0'), '### Added\n\n- Search.');
  assert.equal(
    releaseComparison('0.7.3', '1.0.0-beta.2'),
    '[Compare v0.7.3...v1.0.0-beta.2](https://github.com/xFurti/leogriel/compare/v0.7.3...v1.0.0-beta.2)',
  );
  assert.equal(releaseComparison(undefined, '1.0.0-beta.2'), '');
});

test('publication decisions are idempotent and reject conflicts', () => {
  assert.equal(publicationDecision('sha512-a', null), 'publish');
  assert.equal(publicationDecision('sha512-a', 'sha512-a'), 'skip');
  assert.equal(publicationDecision('sha512-a', 'sha512-b'), 'conflict');
  assert.equal(publicationDecision('sha512-a', 'sha512-b', true), 'skip-equivalent');
  assert.match(tarballIntegrity(Buffer.from('archive')), /^sha512-/);
  assert.equal(resolveDistTag('1.2.3'), 'latest');
  assert.equal(resolveDistTag('1.2.3-beta.1'), 'next');
  assert.equal(resolveDistTag('1.2.3-beta.1', 'beta'), 'beta');
  assert.throws(() => resolveDistTag('1.2.3', '1.2.3'), /cannot be a version/);
});

test('canonical package JSON ignores object-key order but preserves arrays', () => {
  const left = canonicalPackageJson({ dependencies: { b: '1', a: '2' }, files: ['dist', 'README.md'] });
  const right = canonicalPackageJson({ files: ['dist', 'README.md'], dependencies: { a: '2', b: '1' } });
  const changedArray = canonicalPackageJson({ dependencies: { a: '2', b: '1' }, files: ['README.md', 'dist'] });
  assert.equal(left, right);
  assert.notEqual(left, changedArray);
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

test('every publishable workspace package cleans stale output before packing', async () => {
  const packageNames = [
    'core', 'manifest', 'lockfile', 'link-manager', 'plugin-system', 'project-state',
    'adapters', 'security', 'registry', 'import', 'testing', 'cli',
  ];
  for (const packageName of packageNames) {
    const packageJson = JSON.parse(await readFile(join(root, 'packages', packageName, 'package.json'), 'utf8'));
    assert.equal(packageJson.scripts.clean, 'rimraf dist tsconfig.tsbuildinfo', packageJson.name);
    assert.equal(packageJson.scripts.prepack, 'pnpm run clean && pnpm run build', packageJson.name);
  }
});

test('release packing removes stale build output before rebuilding', async () => {
  const script = await readFile(join(root, 'scripts', 'pack-all.mjs'), 'utf8');
  const clean = script.indexOf("runPnpm(['-r', 'run', 'clean']);");
  const buildInfo = script.indexOf("'tsconfig.tsbuildinfo'");
  const build = script.indexOf("runPnpm(['-r', 'build']);");
  assert.notEqual(clean, -1);
  assert.notEqual(buildInfo, -1);
  assert.notEqual(build, -1);
  assert.ok(clean < buildInfo);
  assert.ok(buildInfo < build);
});

test('version preparation updates the canonical and distributable Leogriel skills', async () => {
  const script = await readFile(join(root, 'scripts', 'set-version.mjs'), 'utf8');
  assert.match(script, /join\(root, 'skills', 'leogriel'\)/);
  assert.match(script, /join\(root, '\.leogriel', 'skills', 'leogriel'\)/);
});
