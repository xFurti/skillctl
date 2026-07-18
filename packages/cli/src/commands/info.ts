import { cliLog } from '../lib/output.js';
import type { Command } from 'commander';
import { stat } from 'node:fs/promises';
import { loadLockfile } from '@leogriel/lockfile';
import {
  canonicalizeName,
  findLeogrielProject,
  getGlobalLeogrielRoot,
  getGlobalSkillsStore,
  getProjectSkillsStore,
  resolveEntryCanonicalPath,
} from '@leogriel/core';
import { parseSkillFrontmatterAsync, RegistryManager } from '@leogriel/registry';
import { inspectSkillTargets } from '@leogriel/adapters';
import { handleCommandError } from '../lib/errors.js';

export function registerInfo(program: Command, registry = new RegistryManager()): void {
  program
    .command('info <name-or-specifier>')
    .description('Inspect an installed skill or source without changing project state')
    .option('-g, --global', 'inspect the global installation')
    .option('--json', 'machine-readable output')
    .action(async (input, options) => {
      try {
        const root = options.global ? getGlobalLeogrielRoot() : await findLeogrielProject();
        const store = options.global
          ? getGlobalSkillsStore()
          : root ? getProjectSkillsStore(root) : undefined;
        const lock = root ? await loadLockfile(root) : null;
        const name = tryCanonicalizeName(String(input));
        const entry = name ? lock?.skills[name] : undefined;
        let report: unknown;
        if (entry) {
          const canonicalPath = await resolveEntryCanonicalPath(entry, { store });
          const present = Boolean(await stat(canonicalPath).catch(() => null));
          const metadata = present ? await parseSkillFrontmatterAsync(canonicalPath) : {};
          const targets = present
            ? await inspectSkillTargets([{ name: name!, canonicalPath }], {
                scope: options.global ? 'global' : 'project',
                cwd: root!,
              })
            : null;
          report = {
            installed: true,
            scope: options.global ? 'global' : 'project',
            name: name!,
            specifier: entry.specifier,
            resolved: entry.resolved,
            integrity: entry.integrity,
            canonicalPath,
            present,
            provenance: entry.provenance,
            description: metadata.description,
            targets: targets?.actions.map(({ adapter, scope, target, state }) => ({ adapter, scope, target, state })),
          };
        } else {
          const spec = normalizeCatalogSpecifier(String(input));
          const inspected = await registry.inspect(spec, { cwd: process.cwd() });
          report = {
            installed: false,
            name: inspected.metadata.name || inspected.resolved.name,
            description: inspected.metadata.description,
            specifier: spec,
            resolved: inspected.resolved.resolved,
            integrity: inspected.integrity,
            provenance: {
              type: inspected.resolved.sourceType,
              commit: inspected.resolved.sourceType === 'github' || inspected.resolved.sourceType === 'skills.sh'
                ? inspected.resolved.ref
                : undefined,
              version: inspected.resolved.sourceType === 'npm' ? inspected.resolved.ref : undefined,
              skillSelector: inspected.resolved.skillSelector,
            },
          };
        }
        if (options.json) cliLog(JSON.stringify(report, null, 2));
        else printReport(report as Record<string, unknown>);
      } catch (err) {
        handleCommandError(err, 'info');
      }
    });
}

function normalizeCatalogSpecifier(value: string): string {
  if (!value.includes(':') && value.split('/').filter(Boolean).length >= 3) return `skills.sh/${value.replace(/^\/+/, '')}`;
  return value;
}

function tryCanonicalizeName(value: string): string | undefined {
  try { return canonicalizeName(value); } catch { return undefined; }
}

function printReport(report: Record<string, unknown>): void {
  cliLog(`${report.name}${report.description ? ` — ${report.description}` : ''}`);
  for (const key of ['scope', 'specifier', 'resolved', 'integrity', 'canonicalPath', 'present']) {
    if (report[key] !== undefined) cliLog(`${key}: ${report[key]}`);
  }
  if (report.provenance) cliLog(`provenance: ${JSON.stringify(report.provenance)}`);
  if (Array.isArray(report.targets)) {
    for (const target of report.targets as Array<Record<string, unknown>>) {
      cliLog(`target: ${target.adapter}/${target.scope} ${target.state} ${target.target}`);
    }
  }
}
