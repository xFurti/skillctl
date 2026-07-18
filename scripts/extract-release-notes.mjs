import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function extractReleaseNotes(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^## \\[${escaped}\\](?: - .+)?$`, 'm');
  const start = heading.exec(changelog);
  if (!start) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const bodyStart = start.index + start[0].length;
  const rest = changelog.slice(bodyStart);
  const next = /^## \[/m.exec(rest);
  return rest.slice(0, next?.index ?? rest.length).trim();
}

export function releaseComparison(previousVersion, version) {
  if (!previousVersion) return '';
  return `[Compare v${previousVersion}...v${version}](https://github.com/xFurti/leogriel/compare/v${previousVersion}...v${version})`;
}

async function main() {
  const version = process.argv[2];
  if (!version) throw new Error('Usage: node scripts/extract-release-notes.mjs <version>');
  const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
  const comparisonLink = releaseComparison(process.argv[3], version);
  const comparison = comparisonLink ? `\n\n${comparisonLink}` : '';
  process.stdout.write(`${extractReleaseNotes(changelog, version)}${comparison}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
