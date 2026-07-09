import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: node scripts/set-version.mjs <semver>');
  process.exit(2);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function collectTextFiles(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await collectTextFiles(child));
    else if (/\.(?:md|html|js|ts)$/.test(entry.name)) files.push(child);
  }
  return files;
}

const rootPackagePath = join(root, 'package.json');
const rootPackage = await readJson(rootPackagePath);
const previousVersion = rootPackage.version;
rootPackage.version = version;
await writeJson(rootPackagePath, rootPackage);

const packageRoot = join(root, 'packages');
const packageDirectories = (await readdir(packageRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(packageRoot, entry.name));

for (const directory of packageDirectories) {
  const path = join(directory, 'package.json');
  const packageJson = await readJson(path);
  packageJson.version = version;
  await writeJson(path, packageJson);
}

const manifestPath = join(root, 'agent-skills.json');
const manifest = await readJson(manifestPath);
manifest.version = version;
await writeJson(manifestPath, manifest);

const textFiles = [
  join(root, 'README.md'),
  join(root, 'CONTRIBUTING.md'),
  join(root, 'packages', 'cli', 'README.md'),
  ...await collectTextFiles(join(root, 'docs')),
  ...await collectTextFiles(join(root, 'skills', 'skillctl')),
  ...await collectTextFiles(join(root, 'packages', 'cli', 'src'))
];

for (const path of new Set(textFiles)) {
  const original = await readFile(path, 'utf8');
  const updated = original.replaceAll(previousVersion, version);
  if (updated !== original) await writeFile(path, updated);
}

const versions = new Set([rootPackage.version]);
for (const directory of packageDirectories) {
  versions.add((await readJson(join(directory, 'package.json'))).version);
}
if (versions.size !== 1) throw new Error(`Workspace versions diverged: ${[...versions].join(', ')}`);

console.log(`Updated root, ${packageDirectories.length} packages, manifest, and static docs to ${version}.`);
