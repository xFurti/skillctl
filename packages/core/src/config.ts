import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SkillctlConfig } from './types.js';

const DEFAULT_STORE = join(homedir(), '.skillctl', 'skills');
const CONFIG_DIR = join(homedir(), '.skillctl');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

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
  trustedSources: ['github:vercel-labs/*', 'skills.sh/*'],
};

export async function loadConfig(customPath?: string): Promise<SkillctlConfig> {
  const path = customPath || CONFIG_PATH;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SkillctlConfig>;
    // merge with defaults for forward compat / missing keys
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      agents: { ...DEFAULT_CONFIG.agents, ...parsed.agents },
      trustedSources: parsed.trustedSources ?? DEFAULT_CONFIG.trustedSources,
      registries: parsed.registries ?? DEFAULT_CONFIG.registries,
    } as SkillctlConfig;
  } catch {
    // missing or invalid -> return defaults (do not auto-write unless save called)
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: SkillctlConfig, customPath?: string): Promise<void> {
  const path = customPath || CONFIG_PATH;
  await mkdir(CONFIG_DIR, { recursive: true });
  // simple write; PR2 would have atomic + proper-lockfile
  const data = JSON.stringify(config, null, 2);
  await writeFile(path, data + '\n', 'utf8');
}

export function getDefaultConfig(): SkillctlConfig {
  return { ...DEFAULT_CONFIG };
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
