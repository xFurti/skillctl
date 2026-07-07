import type { Command } from 'commander';
import { executeImport, planImportFromProject, type ImportPlanItem } from '@skillctl/import';
import { handleCommandError } from '../lib/errors.js';
import { confirm } from '../lib/prompt.js';

function printPlan(plan: ImportPlanItem[]): void {
  for (const item of plan) {
    const extra = [
      item.specifier ? `spec=${item.specifier}` : '',
      item.localPath ? `path=${item.localPath}` : '',
      item.originalPath ? `from=${item.originalPath}` : '',
      item.note ? item.note : '',
    ]
      .filter(Boolean)
      .join(' — ');
    console.log(`  ${item.name}: ${item.action}${extra ? ` (${extra})` : ''}`);
  }
}

function printDiscoverySummary(discovered: Awaited<ReturnType<typeof planImportFromProject>>['discovered']): void {
  if (!discovered.sources.length) {
    console.log('No agent skill directories with skills found in this project.');
    return;
  }
  console.log('Discovered skill sources in project:');
  for (const src of discovered.sources) {
    console.log(`  ${src.projectPath} (${src.adapterName}) → ${src.skills.length} skill(s)`);
  }
}

export function registerImport(program: Command): void {
  const importCmd = program
    .command('import')
    .description('Import skills from npx skills, Python skillctl, or agent directories in the project');

  importCmd
    .command('from-project')
    .description('Import skills from detected agent directories (.codex/skills, .claude/skills, .agents/skills, ...)')
    .option('--dry-run', 'show migration plan only')
    .option('--yes, -y', 'skip confirmation prompts')
    .option('--sync', 'sync agent links after import')
    .option('--no-manifest', 'update lock only (do not write agent-skills.json)')
    .option('--lock-only', 'alias for --no-manifest')
    .option('--sources <list>', 'comma-separated adapter ids (codex,claude-code,cursor,...)')
    .action(async (options) => {
      try {
        const cwd = process.cwd();
        const sources = options.sources
          ? String(options.sources)
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : undefined;

        const { plan, discovered } = await planImportFromProject(cwd, { sources });

        if (options.dryRun) {
          printDiscoverySummary(discovered);
          console.log('Migration plan:');
          printPlan(plan);
          return;
        }

        if (!discovered.sources.length) {
          console.log('No agent skill directories with skills found in this project.');
          return;
        }

        printDiscoverySummary(discovered);

        if (!options.yes) {
          const proceed = await confirm('Import these skills into the canonical store?', true);
          if (!proceed) {
            console.log('Import cancelled.');
            return;
          }
        }

        const result = await executeImport({
          source: 'project',
          cwd,
          yes: options.yes,
          sync: options.sync,
          lockOnly: options.lockOnly || options.noManifest,
          sources,
        });

        console.log(`Imported: ${result.imported.join(', ') || '(none)'}`);
        if (result.skipped.length) console.log(`Skipped: ${result.skipped.join(', ')}`);
        if (result.errors.length) {
          console.error('Errors:', result.errors.join('; '));
          process.exitCode = 1;
        }
        if (result.imported.length && !options.sync) {
          console.log('Manifest and lock updated. Run `skillctl sync` to refresh agent links.');
        }
      } catch (err) {
        handleCommandError(err, 'import');
      }
    });

  importCmd
    .command('from-npx')
    .description('Migrate from npx skills (skills-lock.json / .agents/skills)')
    .option('--dry-run', 'show migration plan only')
    .option('--yes', 'skip confirmation prompts')
    .option('--sync', 'sync agent links after import')
    .option('--adopt', 'deprecated alias for --sync')
    .option('--write-manifest', 'update agent-skills.json with imported specs')
    .action(async (options) => {
      try {
        const result = await executeImport({
          source: 'npx',
          dryRun: options.dryRun,
          yes: options.yes,
          sync: options.sync || options.adopt,
          writeManifest: options.writeManifest,
        });

        if (options.dryRun) {
          console.log('Migration plan:');
          printPlan(result.plan);
          return;
        }

        console.log(`Imported: ${result.imported.join(', ') || '(none)'}`);
        if (result.skipped.length) console.log(`Skipped: ${result.skipped.join(', ')}`);
        if (result.errors.length) {
          console.error('Errors:', result.errors.join('; '));
          process.exitCode = 1;
        }
      } catch (err) {
        handleCommandError(err, 'import');
      }
    });

  importCmd
    .command('from-skillctl')
    .description('Migrate from Python skillctl (~/.skillctl/repos)')
    .option('--dry-run', 'show migration plan only')
    .option('--sync', 'sync agent links after import')
    .option('--adopt', 'deprecated alias for --sync')
    .option('--write-manifest', 'update agent-skills.json')
    .action(async (options) => {
      try {
        const result = await executeImport({
          source: 'python-skillctl',
          dryRun: options.dryRun,
          sync: options.sync || options.adopt,
          writeManifest: options.writeManifest,
        });

        if (options.dryRun) {
          console.log('Migration plan:');
          printPlan(result.plan);
          return;
        }

        console.log(`Imported: ${result.imported.join(', ') || '(none)'}`);
        if (result.errors.length) {
          console.error('Errors:', result.errors.join('; '));
          process.exitCode = 1;
        }
      } catch (err) {
        handleCommandError(err, 'import');
      }
    });
}