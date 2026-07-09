import type { Command } from 'commander';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  listInstalledPlugins,
  addPluginRecord,
  removePluginRecord,
  discoverPluginEntry,
  getPluginsDir,
} from '@skillctl/plugin-system';
import { loadConfig, saveConfig } from '@skillctl/core';
import { handleCommandError } from '../lib/errors.js';

export function registerPlugin(program: Command): void {
  const pluginCmd = program.command('plugin').description('Manage skillctl plugins');

  pluginCmd
    .command('list')
    .description('List installed plugins')
    .option('--json', 'JSON output')
    .action(async (options) => {
      const plugins = await listInstalledPlugins();
      const config = await loadConfig();
      if (options.json) {
        console.log(JSON.stringify({ plugins, experimental: config.experimental?.plugins }, null, 2));
        return;
      }
      if (plugins.length === 0) {
        console.log('No plugins installed.');
        console.log('Enable with: set experimental.plugins=true in ~/.skillctl/config.json');
        return;
      }
      for (const p of plugins) {
        console.log(`${p.enabled ? '✓' : '○'} ${p.name} → ${p.path}`);
      }
    });

  pluginCmd
    .command('enable')
    .description('Enable plugin loading (experimental)')
    .action(async () => {
      const config = await loadConfig();
      config.experimental = { ...config.experimental, plugins: true };
      await saveConfig(config);
      console.log('Plugins enabled. Restart skillctl to load plugins.');
    });

  pluginCmd
    .command('add <path>')
    .description('Register a local plugin (directory with package.json skillctl.plugin entry)')
    .action(async (pluginPath) => {
      try {
        const abs = resolve(process.cwd(), pluginPath);
        const entry = await discoverPluginEntry(abs);
        if (!entry) {
          console.error('No skillctl.plugin entry found in package.json');
          process.exitCode = 1;
          return;
        }
        const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(join(abs, 'package.json'), 'utf8'));
        const name = pkg.name || abs.split(/[/\\]/).pop()!;
        await mkdir(getPluginsDir(), { recursive: true });
        await addPluginRecord(name, entry);
        console.log(`Registered plugin ${name} at ${entry}`);
        console.log('Run `skillctl plugin enable` if not already enabled.');
      } catch (err) {
        handleCommandError(err, 'plugin add');
      }
    });

  pluginCmd
    .command('remove <name>')
    .description('Unregister a plugin')
    .action(async (name) => {
      const ok = await removePluginRecord(name);
      if (!ok) {
        console.log(`Plugin not found: ${name}`);
        process.exitCode = 1;
      } else {
        console.log(`Removed plugin ${name}`);
      }
    });
}
