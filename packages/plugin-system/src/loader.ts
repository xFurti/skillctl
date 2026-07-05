import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadConfig, registerAdapter } from '@skillctl/core';
import type { RegistrySource } from '@skillctl/core';
import type { SkillctlPlugin, PluginAPI, PluginProgram } from './types.js';

const PLUGINS_DIR = join(homedir(), '.skillctl', 'plugins');

export function getPluginsDir(): string {
  return PLUGINS_DIR;
}

export async function listInstalledPlugins(): Promise<Array<{ name: string; path: string; enabled: boolean }>> {
  const config = await loadConfig();
  return config.plugins || [];
}

export async function loadPlugins(
  program: PluginProgram,
  registryManager?: { register: (s: RegistrySource) => void }
): Promise<string[]> {
  const config = await loadConfig();
  if (!config.experimental?.plugins) return [];

  const loaded: string[] = [];
  const plugins = (config.plugins || []).filter((p) => p.enabled);

  const api: PluginAPI = {
    registerCommand(cmd) {
      program.addCommand(cmd);
    },
    registerAdapter(adapter) {
      registerAdapter(adapter);
    },
    registerRegistrySource(source) {
      registryManager?.register(source);
    },
  };

  for (const plugin of plugins) {
    try {
      const mod = await import(pathToFileURL(plugin.path).href);
      const pluginExport: SkillctlPlugin = mod.default || mod;
      if (typeof pluginExport.register === 'function') {
        await pluginExport.register(api);
        loaded.push(plugin.name);
      }
    } catch (e) {
      console.warn(`[plugin] failed to load ${plugin.name}: ${(e as Error).message}`);
    }
  }

  return loaded;
}

export async function addPluginRecord(name: string, pluginPath: string): Promise<void> {
  const { loadConfig, saveConfig } = await import('@skillctl/core');
  const config = await loadConfig();
  const plugins = config.plugins || [];
  const existing = plugins.findIndex((p) => p.name === name);
  const record = { name, path: pluginPath, enabled: true };
  if (existing >= 0) plugins[existing] = record;
  else plugins.push(record);
  config.plugins = plugins;
  config.experimental = { ...config.experimental, plugins: true };
  await saveConfig(config);
}

export async function removePluginRecord(name: string): Promise<boolean> {
  const { loadConfig, saveConfig } = await import('@skillctl/core');
  const config = await loadConfig();
  const plugins = config.plugins || [];
  const next = plugins.filter((p) => p.name !== name);
  if (next.length === plugins.length) return false;
  config.plugins = next;
  await saveConfig(config);
  return true;
}

export async function discoverPluginEntry(pluginDir: string): Promise<string | null> {
  try {
    const pkgRaw = await readFile(join(pluginDir, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    const entry = pkg.skillctl?.plugin || pkg.main;
    if (entry) return join(pluginDir, entry);
  } catch {
    // no package.json
  }
  return null;
}