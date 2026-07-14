import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeDirIntegrity, registerAdapter, resolvePathInside } from '@skillctl/core';
import type { CatalogProvider, RegistrySource } from '@skillctl/core';
import type { PluginAPI, PluginAuditRule, PluginProgram, SkillctlPlugin } from './types.js';
import {
  addPlugin,
  getPluginsDir,
  loadPluginLock,
  loadPluginManifest,
  removePlugin,
} from './store.js';

const auditRules: PluginAuditRule[] = [];

export async function listInstalledPlugins(): Promise<Array<{ name: string; path: string; enabled: boolean }>> {
  const [manifest, lock] = await Promise.all([loadPluginManifest({ migrateLegacy: true }), loadPluginLock()]);
  return Object.entries(manifest.plugins).map(([name, requested]) => ({
    name,
    path: lock.plugins[name]?.entrypoint || requested.specifier,
    enabled: requested.enabled,
  }));
}

export async function loadPlugins(
  program: PluginProgram,
  registryManager?: { register: (source: RegistrySource) => void },
  catalogManager?: { register: (provider: CatalogProvider) => void },
): Promise<string[]> {
  const [manifest, lock] = await Promise.all([loadPluginManifest(), loadPluginLock()]);
  const loaded: string[] = [];
  const api: PluginAPI = {
    apiVersion: 1,
    registerCommand(command) { program.addCommand(command); },
    registerAdapter(adapter) { registerAdapter(adapter); },
    registerRegistrySource(source) { registryManager?.register(source); },
    registerCatalogProvider(provider) { catalogManager?.register(provider); },
    registerAuditRule(rule) { auditRules.push(rule); },
  };

  for (const [name, requested] of Object.entries(manifest.plugins)) {
    if (!requested.enabled) continue;
    try {
      const entry = lock.plugins[name];
      if (!entry) throw new Error('missing lock entry; run skillctl plugin install');
      if (entry.apiVersion !== 1) throw new Error(`unsupported plugin API ${entry.apiVersion}`);
      if (await computeDirIntegrity(entry.path) !== entry.integrity) throw new Error('plugin integrity mismatch');
      const entrypoint = entry.entrypoint.startsWith(entry.path)
        ? entry.entrypoint
        : resolvePathInside(entry.path, entry.entrypoint, 'plugin entry');
      const module = await import(pathToFileURL(entrypoint).href);
      const plugin: SkillctlPlugin = module.default || module;
      if (typeof plugin.register !== 'function') throw new Error('plugin does not export register(api)');
      await plugin.register(api);
      loaded.push(name);
    } catch {
      // Startup remains isolated; `plugin doctor` exposes actionable diagnostics.
    }
  }
  return loaded;
}

export function getPluginAuditRules(): PluginAuditRule[] {
  return [...auditRules];
}

/** @deprecated Use addPlugin(). */
export async function addPluginRecord(_name: string, pluginPath: string): Promise<void> {
  await addPlugin(`file:${dirname(pluginPath)}`, { allowLocal: true });
}

/** @deprecated Use removePlugin(). */
export function removePluginRecord(name: string): Promise<boolean> {
  return removePlugin(name);
}

export async function discoverPluginEntry(pluginDir: string): Promise<string | null> {
  try {
    const pkg = JSON.parse(await readFile(join(pluginDir, 'package.json'), 'utf8'));
    const entry = pkg.skillctl?.plugin || pkg.main;
    return entry ? resolvePathInside(pluginDir, entry, 'plugin entry') : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export { getPluginsDir };
