import type { AgentAdapter, SkillctlConfig } from '@skillctl/core';
import { loadConfig, registerAdapter, getRegisteredAdapters } from '@skillctl/core';
import { claudeAdapter } from './claude/index.js';
import { cursorAdapter } from './cursor/index.js';
import { opencodeAdapter } from './opencode/index.js';
import { codexAdapter } from './codex/index.js';
import { geminiAdapter } from './gemini/index.js';
import { grokAdapter } from './grok/index.js';
import { pathExists } from './base/index.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readdir, stat } from 'node:fs/promises';

const BUILTIN_ADAPTERS: AgentAdapter[] = [
  claudeAdapter,
  cursorAdapter,
  opencodeAdapter,
  codexAdapter,
  geminiAdapter,
  grokAdapter,
];

for (const adapter of BUILTIN_ADAPTERS) {
  registerAdapter(adapter);
}

export { claudeAdapter, cursorAdapter, opencodeAdapter, codexAdapter, geminiAdapter, grokAdapter };
export * from './base/index.js';
export type { AgentAdapter };

export const allAdapters: AgentAdapter[] = BUILTIN_ADAPTERS;

export async function getEnabledAdapters(config?: SkillctlConfig): Promise<AgentAdapter[]> {
  const cfg = config || (await loadConfig());
  const enabled = cfg.agents || {};
  return getRegisteredAdapters().filter((a) => enabled[a.id] !== false);
}

export interface CoexistenceReport {
  detected: boolean;
  details: string[];
  paths: string[];
  recommendations: string[];
}

async function countSkillsInDir(dir: string): Promise<number> {
  let count = 0;
  try {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if ((!item.isDirectory() && !item.isSymbolicLink()) || item.name.startsWith('.')) continue;
      for (const name of ['SKILL.md', 'skill.md']) {
        try {
          const st = await stat(join(dir, item.name, name));
          if (st.isFile()) {
            count++;
            break;
          }
        } catch {
          // continue
        }
      }
    }
  } catch {
    // missing dir
  }
  return count;
}

export async function scanCoexistence(cwd = process.cwd()): Promise<CoexistenceReport> {
  const details: string[] = [];
  const paths: string[] = [];
  const recs: string[] = [];
  let projectSkillDirs = 0;

  for (const adapter of BUILTIN_ADAPTERS) {
    for (const projectPath of adapter.projectPaths) {
      const abs = join(cwd, projectPath);
      if (!(await pathExists(abs))) continue;
      const count = await countSkillsInDir(abs);
      if (count > 0) {
        projectSkillDirs++;
        details.push(`Found ${projectPath} with ${count} skill(s) (${adapter.name})`);
        paths.push(abs);
      }
    }
  }

  if (projectSkillDirs > 0) {
    recs.push('Run `skillctl import from-project --dry-run` to migrate agent skills into canonical store');
  }

  const agentsSkills = join(cwd, '.agents', 'skills');
  if (await pathExists(agentsSkills) && !paths.includes(agentsSkills)) {
    details.push('Found .agents/skills (common universal layout used by npx skills and many agents)');
    paths.push(agentsSkills);
    recs.push('Run `skillctl import from-npx --dry-run` to migrate into canonical store');
  }

  const skillctlHome = join(homedir(), '.skillctl');
  const pythonRepos = join(skillctlHome, 'repos');
  const pythonManifest = join(skillctlHome, 'manifest.json');
  if ((await pathExists(pythonRepos)) || (await pathExists(pythonManifest))) {
    details.push('Found Python skillctl data under ~/.skillctl');
    paths.push(skillctlHome);
    recs.push('Run `skillctl import from-skillctl --dry-run` if using Python skillctl');
  }

  const npxLock = join(cwd, 'skills-lock.json');
  if (await pathExists(npxLock)) {
    details.push('Found skills-lock.json (npx skills / vercel-labs format)');
    paths.push(npxLock);
    recs.push('Run `skillctl import --from-npx` to adopt skills with provenance');
  }

  const npxGlobalHint = join(homedir(), '.local', 'share', 'skills');
  if (await pathExists(npxGlobalHint)) {
    details.push('Possible npx skills global data');
    paths.push(npxGlobalHint);
  }

  const ourConfig = join(homedir(), '.skillctl', 'config.json');
  if (await pathExists(ourConfig)) {
    details.push('skillctl config present (native)');
  }

  const detected = details.length > 0;
  if (!detected) {
    details.push('No obvious coexistence markers found');
  } else if (recs.length === 0) {
    recs.push('Proceed; adapters will manage targets safely');
  }

  return { detected, details, paths, recommendations: recs };
}

export const ADAPTER_IDS = BUILTIN_ADAPTERS.map((a) => a.id);

export * from './sync.js';
