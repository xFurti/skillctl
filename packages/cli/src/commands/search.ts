import { cliLog } from '../lib/output.js';
import type { Command } from 'commander';
import * as prompts from '@clack/prompts';
import { CatalogManager, RegistryManager } from '@skillctl/registry';
import { SkillctlError, handleCommandError } from '../lib/errors.js';

export function registerSearch(
  program: Command,
  catalog = new CatalogManager(),
  registry = new RegistryManager(),
): void {
  program
    .command('search [query]')
    .description('Search the Agent Skills catalog')
    .option('--owner <github-owner>', 'limit results to a GitHub owner')
    .option('--limit <number>', 'maximum results (1-50)', parseLimit, 10)
    .option('--add <catalog-id>', 'add one exact result')
    .option('-g, --global', 'add to the personal/global store')
    .option('-y, --yes', 'confirm non-interactive add')
    .option('--json', 'machine-readable output')
    .action(async (query, options) => {
      try {
        const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !options.json);
        let searchQuery = String(query || '').trim();
        if (!searchQuery && options.add) searchQuery = String(options.add).split('/').pop() || '';
        if (!searchQuery && interactive) {
          const entered = await prompts.text({ message: 'Search skills', validate: (value) => value.trim().length < 2 ? 'Enter at least 2 characters' : undefined });
          if (prompts.isCancel(entered)) return;
          searchQuery = String(entered).trim();
        }
        if (searchQuery.length < 2) throw new SkillctlError('A search query of at least 2 characters is required', 'SEARCH_QUERY_REQUIRED', 2);

        const results = await catalog.search(searchQuery, { owner: options.owner, limit: options.limit });
        if (options.json && !options.add) {
          cliLog(JSON.stringify({ query: searchQuery, results }, null, 2));
          if (results.some((result) => result.stale)) process.exitCode = 1;
          return;
        }

        if (results.length === 0) {
          cliLog(`No skills found for "${searchQuery}".`);
          return;
        }
        if (!options.json) {
          for (const result of results) {
            cliLog(`${result.id}${result.installs ? ` (${result.installs} installs)` : ''}${result.stale ? ' [cached]' : ''}`);
            cliLog(`  ${result.url || result.installSpecifier}`);
          }
        }

        let selectedId = options.add as string | undefined;
        if (!selectedId && interactive) {
          const selected = await prompts.select({
            message: 'Select a skill to inspect or add',
            options: results.map((result) => ({
              value: result.id,
              label: result.name,
              hint: `${result.source}${result.installs ? ` · ${result.installs} installs` : ''}`,
            })),
          });
          if (prompts.isCancel(selected)) return;
          selectedId = String(selected);
        }
        if (!selectedId) return;
        const selected = results.find((result) => result.id === selectedId);
        if (!selected) throw new SkillctlError(`Catalog result not found: ${selectedId}`, 'SEARCH_RESULT_NOT_FOUND', 2);

        let global = Boolean(options.global);
        if (interactive && !options.global) {
          const scope = await prompts.select({
            message: `Add ${selected.name}?`,
            options: [
              { value: 'project', label: 'Current project' },
              { value: 'global', label: 'Personal/global' },
              { value: 'cancel', label: 'Cancel' },
            ],
          });
          if (prompts.isCancel(scope) || scope === 'cancel') return;
          global = scope === 'global';
        } else if (!interactive && !options.yes) {
          throw new SkillctlError('Non-interactive catalog adds require --yes', 'CONFIRMATION_REQUIRED', 2);
        }

        if (!options.json) cliLog(`Adding ${selected.installSpecifier} to ${global ? 'global' : 'project'} scope...`);
        const entry = await registry.add(selected.installSpecifier, { global, updateManifest: !global });
        if (options.json) cliLog(JSON.stringify({ query: searchQuery, results, added: entry }, null, 2));
        else cliLog(`Added ${entry.name} (${entry.resolved}). Run skillctl sync to refresh agent targets.`);
      } catch (err) {
        handleCommandError(err, 'search');
      }
    });
}

function parseLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) throw new Error('--limit must be between 1 and 50');
  return parsed;
}
