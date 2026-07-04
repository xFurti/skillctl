import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { SkillLockfileSchema, validateLockfile } from './schema.js';
import type { SkillLockfile, LockfileEntry } from '@skillctl/core';
import { writeFileAtomic, ensureDir } from '@skillctl/core';

/**
 * Lockfile parser/generator: pnpm-style YAML with lockfileVersion.
 * Detailed mixed-source fields (integrity + provenance).
 * load/save are the core for PR3.
 */

export const DEFAULT_LOCKFILE_NAME = 'agent-skills.lock';

export async function loadLockfile(cwd = process.cwd(), fileName = DEFAULT_LOCKFILE_NAME): Promise<SkillLockfile | null> {
  const path = resolve(cwd, fileName);
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = yaml.load(raw) as unknown;
    if (!parsed) return null;
    return validateLockfile(parsed);
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    if (err.name === 'YAMLException') {
      throw new Error(`Invalid YAML lockfile ${fileName}: ${err.message}`);
    }
    throw err;
  }
}

export async function saveLockfile(lock: SkillLockfile, cwd = process.cwd(), fileName = DEFAULT_LOCKFILE_NAME): Promise<string> {
  const validated = validateLockfile(lock);
  const path = resolve(cwd, fileName);
  // pnpm-style: use block scalars etc, sort keys for determinism, no refs
  const dumped = yaml.dump(validated, {
    noRefs: true,
    sortKeys: false, // preserve skill order somewhat; caller can sort if wanted
    lineWidth: 120,
    indent: 2,
  });
  await ensureDir(resolve(cwd));
  await writeFileAtomic(path, dumped);
  return path;
}

export function createEmptyLockfile(agents: string[] = []): SkillLockfile {
  return {
    lockfileVersion: '1.0',
    agents: agents.length ? agents : undefined,
    skills: {},
  };
}

export function addOrUpdateEntry(lock: SkillLockfile, name: string, entry: LockfileEntry): SkillLockfile {
  // collision policy: overwrite same name (last wins with warning caller), enforce unique keys
  const newSkills = { ...lock.skills, [name]: entry };
  return {
    ...lock,
    skills: newSkills,
  };
}

// Basic integrity/provenance example builder (used by later PRs, here for tests/fixtures)
export function makeLockEntry(
  name: string,
  specifier: string,
  resolved: string,
  integrity: string,
  canonicalPath: string,
  provenance: LockfileEntry['provenance']
): LockfileEntry {
  return {
    specifier,
    resolved,
    integrity,
    name,
    canonicalPath,
    fetchedAt: new Date().toISOString(),
    provenance,
  };
}
