import type { AgentAdapter, LeogrielConfig } from '@leogriel/core';
import {
  getGlobalSkillsStore,
  getProjectSkillsStore,
  loadConfig,
  registerAdapter,
  getRegisteredAdapters,
} from '@leogriel/core';
import { LinkManager } from '@leogriel/link-manager';
import { claudeAdapter } from './claude/index.js';
import { cursorAdapter } from './cursor/index.js';
import { opencodeAdapter } from './opencode/index.js';
import { codexAdapter } from './codex/index.js';
import { geminiAdapter } from './gemini/index.js';
import { grokAdapter } from './grok/index.js';
import { piAdapter } from './pi/index.js';
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
  piAdapter,
];

for (const adapter of BUILTIN_ADAPTERS) {
  registerAdapter(adapter);
}

export { claudeAdapter, cursorAdapter, opencodeAdapter, codexAdapter, geminiAdapter, grokAdapter, piAdapter };
export * from './base/index.js';
export type { AgentAdapter };

export const allAdapters: AgentAdapter[] = BUILTIN_ADAPTERS;

export async function getEnabledAdapters(config?: LeogrielConfig): Promise<AgentAdapter[]> {
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

async function countUnmanagedSkillsInDir(dir: string, stores: string[]): Promise<number> {
  let count = 0;
  const manager = new LinkManager();
  try {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if ((!item.isDirectory() && !item.isSymbolicLink()) || item.name.startsWith('.')) continue;
      const skillPath = join(dir, item.name);
      for (const name of ['SKILL.md', 'skill.md']) {
        try {
          const st = await stat(join(skillPath, name));
          if (st.isFile()) {
            const inspections = await Promise.all(stores.map((store) => manager.inspectManagedTarget(skillPath, store)));
            if (inspections.every((inspection) => inspection.kind === 'unmanaged')) count++;
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
  const managedStores = [getProjectSkillsStore(cwd), getGlobalSkillsStore()];

  for (const adapter of BUILTIN_ADAPTERS) {
    for (const projectPath of adapter.projectPaths) {
      const abs = join(cwd, projectPath);
      if (!(await pathExists(abs))) continue;
      const count = await countUnmanagedSkillsInDir(abs, managedStores);
      if (count > 0) {
        projectSkillDirs++;
        details.push(`Found ${projectPath} with ${count} skill(s) (${adapter.name})`);
        paths.push(abs);
      }
    }
  }

  if (projectSkillDirs > 0) {
    recs.push('Run `leogriel import --dry-run` to review agent skills before copying them into the project store');
  }

  const agentsSkills = join(cwd, '.agents', 'skills');
  const unmanagedAgentsSkills = await countUnmanagedSkillsInDir(agentsSkills, managedStores);
  if (unmanagedAgentsSkills > 0 && !paths.includes(agentsSkills)) {
    details.push(
      `Found .agents/skills with ${unmanagedAgentsSkills} unmanaged skill(s) ` +
        '(common universal layout used by npx skills and many agents)',
    );
    paths.push(agentsSkills);
    recs.push('Run `leogriel import from-npx --dry-run` to migrate into the project store');
  }

  const legacySkillctlHome = join(homedir(), '.skillctl');
  const pythonRepos = join(legacySkillctlHome, 'repos');
  const pythonManifest = join(legacySkillctlHome, 'manifest.json');
  if ((await pathExists(pythonRepos)) || (await pathExists(pythonManifest))) {
    details.push('Found legacy Python skillctl data under ~/.skillctl');
    paths.push(legacySkillctlHome);
    recs.push('Run `leogriel import from-skillctl --dry-run` to migrate legacy Python skillctl data');
  }

  const npxLock = join(cwd, 'skills-lock.json');
  if (await pathExists(npxLock)) {
    details.push('Found skills-lock.json (npx skills / vercel-labs format)');
    paths.push(npxLock);
    recs.push('Run `leogriel import from-npx --dry-run` to adopt skills with provenance');
  }

  const npxGlobalHint = join(homedir(), '.local', 'share', 'skills');
  if (await pathExists(npxGlobalHint)) {
    details.push('Possible npx skills global data');
    paths.push(npxGlobalHint);
  }

  const ourConfig = join(homedir(), '.leogriel', 'config.json');
  if (await pathExists(ourConfig)) {
    details.push('leogriel config present (native)');
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
export * from './backups.js';
