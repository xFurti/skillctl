import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { SkillctlConfig } from './types.js';
import { writeFileAtomic } from './fs.js';

const DEFAULT_STORE = join(homedir(), '.skillctl', 'skills');
const CONFIG_PATH = join(homedir(), '.skillctl', 'config.json');

const DEFAULT_CONFIG: SkillctlConfig = {
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
  },
  registries: [],
  trustedSources: ['github:vercel-labs/*', 'skills.sh/*', 'github:xFurti/skillctl/*'],
};

export async function loadConfig(customPath?: string): Promise<SkillctlConfig> {
  const path = customPath || CONFIG_PATH;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SkillctlConfig>;
    validateConfig(parsed);
    // merge with defaults for forward compat / missing keys
    const config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      agents: { ...DEFAULT_CONFIG.agents, ...parsed.agents },
      trustedSources: parsed.trustedSources ?? DEFAULT_CONFIG.trustedSources,
      registries: parsed.registries ?? DEFAULT_CONFIG.registries,
    } as SkillctlConfig;
    if (process.env.SKILLCTL_STORE) config.store = process.env.SKILLCTL_STORE;
    return config;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return cloneDefaultConfig();
    throw new Error(`Unable to load skillctl config at ${path}: ${(err as Error).message}`, { cause: err });
  }
}

export async function saveConfig(config: SkillctlConfig, customPath?: string): Promise<void> {
  const path = customPath || CONFIG_PATH;
  validateConfig(config);
  await mkdir(dirname(path), { recursive: true });
  const data = JSON.stringify(config, null, 2);
  await writeFileAtomic(path, data + '\n');
}

export function getDefaultConfig(): SkillctlConfig {
  return cloneDefaultConfig();
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

function cloneDefaultConfig(): SkillctlConfig {
  const config: SkillctlConfig = {
    ...DEFAULT_CONFIG,
    agents: { ...DEFAULT_CONFIG.agents },
    registries: [...(DEFAULT_CONFIG.registries || [])],
    trustedSources: [...(DEFAULT_CONFIG.trustedSources || [])],
  };
  if (process.env.SKILLCTL_STORE) config.store = process.env.SKILLCTL_STORE;
  return config;
}

function validateConfig(config: Partial<SkillctlConfig>): void {
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
    config.registries !== undefined &&
    (!Array.isArray(config.registries) || config.registries.some((v) => typeof v !== 'string'))
  ) {
    throw new Error('registries must be an array');
  }
  if (
    config.trustedSources !== undefined &&
    (!Array.isArray(config.trustedSources) || config.trustedSources.some((v) => typeof v !== 'string'))
  ) {
    throw new Error('trustedSources must be an array');
  }
}
