import type { Command } from 'commander';
import {
  addPlugin,
  installPlugins,
  listInstalledPlugins,
  loadPluginLock,
  loadPluginManifest,
  pluginDiagnostics,
  removePlugin,
  setPluginEnabled,
} from '@skillctl/plugin-system';
import { handleCommandError } from '../lib/errors.js';

export function registerPlugin(program: Command): void {
  const plugin = program.command('plugin').description('Manage experimental skillctl plugins');

  plugin.command('list').option('--json', 'machine-readable output').action(async (options) => {
    const plugins = await listInstalledPlugins();
    if (options.json) console.log(JSON.stringify({ experimental: true, plugins }, null, 2));
    else if (!plugins.length) console.log('No plugins installed.');
    else for (const item of plugins) console.log(`${item.enabled ? 'enabled' : 'disabled'} ${item.name} -> ${item.path}`);
  });

  plugin
    .command('add <specifier>')
    .description('Install an npm plugin or explicitly allow a local development plugin')
    .option('--allow-local', 'allow a local plugin that executes arbitrary code')
    .option('--json', 'machine-readable output')
    .action(async (specifier, options) => {
      try {
        const entry = await addPlugin(specifier, { allowLocal: options.allowLocal });
        if (options.json) console.log(JSON.stringify(entry, null, 2));
        else console.log(`Installed experimental plugin ${entry.name} (${entry.resolved}).`);
      } catch (err) { handleCommandError(err, 'plugin add'); }
    });

  plugin.command('install').description('Restore all plugins from the plugin manifest').action(async () => {
    try { console.log(`Installed ${await installPlugins().then((entries) => entries.length)} plugin(s).`); }
    catch (err) { handleCommandError(err, 'plugin install'); }
  });

  plugin.command('update [names...]').description('Re-resolve selected plugin specifiers').action(async (names) => {
    try {
      const manifest = await loadPluginManifest({ migrateLegacy: true });
      const selected = names.length ? names : Object.keys(manifest.plugins);
      for (const name of selected) {
        const requested = manifest.plugins[name];
        if (!requested) throw new Error(`Plugin not found: ${name}`);
        await addPlugin(requested.specifier, { allowLocal: requested.allowLocal });
      }
      console.log(`Updated ${selected.length} plugin(s).`);
    } catch (err) { handleCommandError(err, 'plugin update'); }
  });

  for (const enabled of [true, false]) {
    plugin.command(`${enabled ? 'enable' : 'disable'} <name>`).action(async (name) => {
      const ok = await setPluginEnabled(name, enabled);
      if (!ok) { console.error(`Plugin not found: ${name}`); process.exitCode = 1; return; }
      console.log(`${enabled ? 'Enabled' : 'Disabled'} ${name}. Restart skillctl to apply.`);
    });
  }

  plugin.command('info <name>').option('--json', 'machine-readable output').action(async (name, options) => {
    const [manifest, lock] = await Promise.all([loadPluginManifest({ migrateLegacy: true }), loadPluginLock()]);
    const report = { requested: manifest.plugins[name], locked: lock.plugins[name] };
    if (!report.requested) { console.error(`Plugin not found: ${name}`); process.exitCode = 1; return; }
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else console.log(JSON.stringify(report, null, 2));
  });

  plugin.command('doctor').option('--json', 'machine-readable output').action(async (options) => {
    const diagnostics = await pluginDiagnostics();
    if (options.json) console.log(JSON.stringify({ diagnostics }, null, 2));
    else for (const item of diagnostics) console.log(`${item.ok ? 'ok' : 'error'} ${item.name}: ${item.message}`);
    if (diagnostics.some((item) => !item.ok)) process.exitCode = 1;
  });

  plugin.command('remove <name>').action(async (name) => {
    const ok = await removePlugin(name);
    if (!ok) { console.error(`Plugin not found: ${name}`); process.exitCode = 1; return; }
    console.log(`Removed ${name}.`);
  });
}
