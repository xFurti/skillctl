export {
  loadPlugins,
  listInstalledPlugins,
  addPluginRecord,
  removePluginRecord,
  discoverPluginEntry,
  getPluginsDir,
} from './loader.js';
export type { SkillctlPlugin, PluginAPI, PluginProgram, PluginCommand } from './types.js';