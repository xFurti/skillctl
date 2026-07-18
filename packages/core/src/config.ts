import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { LeogrielConfig } from './types.js';
import { writeFileAtomic } from './fs.js';

const CURRENT_ROOT = join(homedir(), '.leogriel');
const LEGACY_ROOT = join(homedir(), '.skillctl');
const DEFAULT_STORE = join(existsSync(CURRENT_ROOT) || !existsSync(LEGACY_ROOT) ? CURRENT_ROOT : LEGACY_ROOT, 'skills');
const CONFIG_PATH = join(homedir(), '.leogriel', 'config.json');
const LEGACY_CONFIG_PATH = join(homedir(), '.skillctl', 'config.json');

const DEFAULT_CONFIG: LeogrielConfig = {
  version: 1,
  store: DEFAULT_STORE,
  defaultMode: 'symlink',
  agents: {
    'claude-code': true,
    cursor: true,
    opencode: true,
    codex: true,
    'gemini-cli': true,
    grok: true,
    pi: true,
  },
  trustedSources: [
    'github:vercel-labs/*',
    'skills.sh/*',
    'github:xFurti/leogriel/*',
    'file:./.leogriel/skills/*',
    'file:./.skillctl/skills/*',
    'file:./skills/*',
  ],
};

export async function loadConfig(customPath?: string): Promise<LeogrielConfig> {
  const path =
    customPath ||
    process.env.LEOGRIEL_CONFIG ||
    process.env.SKILLCTL_CONFIG ||
    CONFIG_PATH;
  try {
    let selectedPath = path;
    let raw: string;
    try {
      raw = await readFile(selectedPath, 'utf8');
    } catch (err) {
      if (!customPath && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        selectedPath = LEGACY_CONFIG_PATH;
        raw = await readFile(selectedPath, 'utf8');
      } else {
        throw err;
      }
    }
    const parsed = JSON.parse(raw) as Partial<LeogrielConfig> & {
      registries?: unknown;
      experimental?: unknown;
    };
    validateConfig(parsed);
    const { registries: _legacyRegistries, experimental: _legacyExperimental, ...supported } = parsed;
    // merge with defaults for forward compat / missing keys
    const config = {
      ...DEFAULT_CONFIG,
      ...supported,
      agents: { ...DEFAULT_CONFIG.agents, ...parsed.agents },
      trustedSources: parsed.trustedSources ?? DEFAULT_CONFIG.trustedSources,
      security: { trustedSourcesMode: 'warn', ...parsed.security },
    } as LeogrielConfig;
    const storeOverride = process.env.LEOGRIEL_STORE ?? process.env.SKILLCTL_STORE;
    if (storeOverride) config.store = storeOverride;
    return config;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return cloneDefaultConfig();
    throw new Error(`Unable to load leogriel config at ${path}: ${(err as Error).message}`, { cause: err });
  }
}

export async function saveConfig(config: LeogrielConfig, customPath?: string): Promise<void> {
  const path =
    customPath ||
    process.env.LEOGRIEL_CONFIG ||
    process.env.SKILLCTL_CONFIG ||
    CONFIG_PATH;
  validateConfig(config);
  await mkdir(dirname(path), { recursive: true });
  const data = JSON.stringify(config, null, 2);
  await writeFileAtomic(path, data + '\n');
}

export function getDefaultConfig(): LeogrielConfig {
  return cloneDefaultConfig();
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

function cloneDefaultConfig(): LeogrielConfig {
  const config: LeogrielConfig = {
    ...DEFAULT_CONFIG,
    agents: { ...DEFAULT_CONFIG.agents },
    trustedSources: [...(DEFAULT_CONFIG.trustedSources || [])],
  };
  const storeOverride = process.env.LEOGRIEL_STORE ?? process.env.SKILLCTL_STORE;
  if (storeOverride) config.store = storeOverride;
  return config;
}

function validateConfig(config: Partial<LeogrielConfig>): void {
  if (!config || typeof config !== 'object') throw new Error('config must be an object');
  if (config.version !== undefined && config.version !== 1) throw new Error('unsupported config version');
  if (config.store !== undefined && typeof config.store !== 'string') throw new Error('store must be a string');
  if (
    config.defaultMode !== undefined &&
    !['symlink', 'copy', 'junction'].includes(config.defaultMode)
  ) {
    throw new Error('defaultMode must be symlink, copy, or junction');
  }
  if (
    config.agents !== undefined &&
    (typeof config.agents !== 'object' || Object.values(config.agents).some((v) => typeof v !== 'boolean'))
  ) {
    throw new Error('agents must map agent ids to booleans');
  }
  if (
    config.trustedSources !== undefined &&
    (!Array.isArray(config.trustedSources) || config.trustedSources.some((v) => typeof v !== 'string'))
  ) {
    throw new Error('trustedSources must be an array');
  }
  if (config.security?.trustedSourcesMode && !['off', 'warn', 'error'].includes(config.security.trustedSourcesMode)) {
    throw new Error('security.trustedSourcesMode must be off, warn, or error');
  }
}
