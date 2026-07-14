import { cliLog, cliError } from '../lib/output.js';
import type { Command } from 'commander';
import {
  addPlugin,
  inspectPluginSpecifier,
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
    if (options.json) cliLog(JSON.stringify({ experimental: true, plugins }, null, 2));
    else if (!plugins.length) cliLog('No plugins installed.');
    else for (const item of plugins) cliLog(`${item.enabled ? 'enabled' : 'disabled'} ${item.name} -> ${item.path}`);
  });

  plugin
    .command('add <specifier>')
    .description('Install an npm plugin or explicitly allow a local development plugin')
    .option('--allow-local', 'allow a local plugin that executes arbitrary code')
    .option('--dry-run', 'inspect without changing plugin state')
    .option('--json', 'machine-readable output')
    .action(async (specifier, options) => {
      try {
        if (options.dryRun) {
          const inspection = await inspectPluginSpecifier(specifier, { allowLocal: options.allowLocal });
          if (options.json) cliLog(JSON.stringify({ dryRun: true, inspection }, null, 2));
          else cliLog(JSON.stringify(inspection, null, 2));
          return;
        }
        const entry = await addPlugin(specifier, { allowLocal: options.allowLocal });
        if (options.json) cliLog(JSON.stringify(entry, null, 2));
        else cliLog(`Installed experimental plugin ${entry.name} (${entry.resolved}).`);
      } catch (err) { handleCommandError(err, 'plugin add'); }
    });

  plugin.command('install').description('Restore all plugins from the plugin manifest').option('--json', 'machine-readable output').action(async (options) => {
    try {
      const entries = await installPlugins();
      if (options.json) cliLog(JSON.stringify({ installed: entries }, null, 2));
      else cliLog(`Installed ${entries.length} plugin(s).`);
    }
    catch (err) { handleCommandError(err, 'plugin install'); }
  });

  plugin.command('update [names...]').description('Re-resolve selected plugin specifiers').option('--json', 'machine-readable output').action(async (names, options) => {
    try {
      const manifest = await loadPluginManifest({ migrateLegacy: true });
      const selected = names.length ? names : Object.keys(manifest.plugins);
      const updated = [];
      for (const name of selected) {
        const requested = manifest.plugins[name];
        if (!requested) throw new Error(`Plugin not found: ${name}`);
        updated.push(await addPlugin(requested.specifier, { allowLocal: requested.allowLocal }));
      }
      if (options.json) cliLog(JSON.stringify({ updated }, null, 2));
      else cliLog(`Updated ${selected.length} plugin(s).`);
    } catch (err) { handleCommandError(err, 'plugin update'); }
  });

  for (const enabled of [true, false]) {
    plugin.command(`${enabled ? 'enable' : 'disable'} <name>`).option('--json', 'machine-readable output').action(async (name, options) => {
      const ok = await setPluginEnabled(name, enabled);
      if (!ok) { cliError(`Plugin not found: ${name}`); process.exitCode = 1; return; }
      if (options.json) cliLog(JSON.stringify({ name, enabled, restartRequired: true }, null, 2));
      else cliLog(`${enabled ? 'Enabled' : 'Disabled'} ${name}. Restart skillctl to apply.`);
    });
  }

  plugin.command('info <name>').option('--json', 'machine-readable output').action(async (name, options) => {
    const [manifest, lock] = await Promise.all([loadPluginManifest({ migrateLegacy: true }), loadPluginLock()]);
    const report = { requested: manifest.plugins[name], locked: lock.plugins[name] };
    if (!report.requested) { cliError(`Plugin not found: ${name}`); process.exitCode = 1; return; }
    if (options.json) cliLog(JSON.stringify(report, null, 2));
    else cliLog(JSON.stringify(report, null, 2));
  });

  plugin.command('doctor').option('--json', 'machine-readable output').action(async (options) => {
    const diagnostics = await pluginDiagnostics();
    if (options.json) cliLog(JSON.stringify({ diagnostics }, null, 2));
    else for (const item of diagnostics) cliLog(`${item.ok ? 'ok' : 'error'} ${item.name}: ${item.message}`);
    if (diagnostics.some((item) => !item.ok)) process.exitCode = 1;
  });

  plugin.command('remove <name>').option('--json', 'machine-readable output').action(async (name, options) => {
    const ok = await removePlugin(name);
    if (!ok) { cliError(`Plugin not found: ${name}`); process.exitCode = 1; return; }
    if (options.json) cliLog(JSON.stringify({ name, removed: true }, null, 2));
    else cliLog(`Removed ${name}.`);
  });
}
