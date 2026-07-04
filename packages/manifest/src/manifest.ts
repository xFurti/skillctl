import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AgentSkillsManifestSchema, validateManifest, type AgentSkillsManifest } from './schema.js';
import { writeFileAtomic } from '@skillctl/core';

// Re-export schema symbols + types for consumers/tests importing from manifest entry
export { AgentSkillsManifestSchema, validateManifest, type AgentSkillsManifest } from './schema.js';

/**
 * Manifest parser / generator for agent-skills.json
 * Uses Zod for schema + validation. Follows package-manager style.
 */

export const DEFAULT_MANIFEST_NAME = 'agent-skills.json';

export async function loadManifest(cwd = process.cwd(), fileName = DEFAULT_MANIFEST_NAME): Promise<AgentSkillsManifest | null> {
  const path = resolve(cwd, fileName);
  try {
    const raw = await readFile(path, 'utf8');
    const json = JSON.parse(raw);
    return validateManifest(json);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${fileName}: ${err.message}`);
    }
    throw err;
  }
}

export async function saveManifest(manifest: AgentSkillsManifest, cwd = process.cwd(), fileName = DEFAULT_MANIFEST_NAME): Promise<string> {
  const validated = validateManifest(manifest);
  const path = resolve(cwd, fileName);
  const data = JSON.stringify(validated, null, 2) + '\n';
  await writeFileAtomic(path, data);
  return path;
}

export function createDefaultManifest(projectName?: string): AgentSkillsManifest {
  return {
    name: projectName,
    version: '0.0.0',
    agentSkills: {
      dependencies: {},
      devDependencies: {},
    },
  };
}

// Collision policy helper (project > global precedence documented; here for names in one manifest)
export function checkNameCollision(manifest: AgentSkillsManifest): string[] {
  const deps = Object.keys(manifest.agentSkills?.dependencies || {});
  const dev = Object.keys(manifest.agentSkills?.devDependencies || {});
  const seen = new Set<string>();
  const collisions: string[] = [];
  for (const n of [...deps, ...dev]) {
    if (seen.has(n)) collisions.push(n);
    seen.add(n);
  }
  return collisions;
}
