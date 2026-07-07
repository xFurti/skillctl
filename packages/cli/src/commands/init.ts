import type { Command } from 'commander';
import { loadManifest, createDefaultManifest, saveManifest } from '@skillctl/manifest';
import { discoverProjectSkills, executeImport } from '@skillctl/import';
import { confirm } from '../lib/prompt.js';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize agent-skills.json in current project')
    .option('--no-prompt', 'skip post-init import wizard')
    .action(async (options) => {
      const existing = await loadManifest();
      if (existing) {
        console.log('agent-skills.json already exists');
        return;
      }
      const sample = createDefaultManifest('demo-project');
      await saveManifest(sample);
      console.log('Created agent-skills.json');

      if (options.noPrompt) {
        console.log('Run `skillctl add <spec>` or `skillctl import from-project` to populate, then `install` or `sync`.');
        return;
      }

      const { deduped, sources } = await discoverProjectSkills();
      const unmanaged = deduped.length;
      if (!unmanaged || !sources.length) {
        console.log('Run `skillctl add <spec>` to populate, then `install` or `sync`.');
        return;
      }

      console.log(`Found ${unmanaged} existing skill(s) in agent directories (${sources.map((s) => s.projectPath).join(', ')}).`);
      const shouldImport = await confirm('Import them into skillctl now?', true);
      if (!shouldImport) {
        console.log('Run `skillctl import from-project` when ready.');
        return;
      }

      const result = await executeImport({ source: 'project', sync: true });
      console.log(`Imported: ${result.imported.join(', ') || '(none)'}`);
      if (result.errors.length) {
        console.error('Import errors:', result.errors.join('; '));
      }
      if (!result.imported.length) {
        console.log('Run `skillctl add <spec>` to populate, then `install` or `sync`.');
      }
    });
}