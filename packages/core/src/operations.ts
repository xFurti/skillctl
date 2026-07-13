import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import type { LockfileEntry, SkillLockfile } from './types.js';
import { loadConfig } from './config.js';
import { computeDirIntegrity } from './fs.js';
import { canonicalizeName } from './names.js';
import { resolveCanonicalPath } from './paths.js';

export interface InstallResult {
  installed: number;
  skipped: number;
  lock: SkillLockfile;
}

async function resolveStoreRoot(store?: string): Promise<string> {
  if (store) return store;
  return (await loadConfig()).store;
}

/** Resolve a lock entry canonicalPath to a real filesystem path (tilde, legacy absolute, or store fallback). */
export async function resolveEntryCanonicalPath(
  entry: LockfileEntry,
  options?: { store?: string }
): Promise<string> {
  const store = await resolveStoreRoot(options?.store);
  const primary = resolveCanonicalPath(entry.canonicalPath, store);
  try {
    await stat(primary);
    return primary;
  } catch {
    const fallback = join(store, canonicalizeName(entry.name));
    try {
      await stat(fallback);
      return fallback;
    } catch {
      return primary;
    }
  }
}

export async function needsInstall(entry: LockfileEntry, options?: { store?: string }): Promise<boolean> {
  const path = await resolveEntryCanonicalPath(entry, options);
  try {
    await stat(path);
  } catch {
    return true;
  }
  try {
    const integrity = await computeDirIntegrity(path);
    return integrity !== entry.integrity;
  } catch {
    return true;
  }
}

export async function verifyLockIntegrity(
  lock: SkillLockfile,
  options?: { store?: string }
): Promise<string[]> {
  const errors: string[] = [];
  for (const [name, entry] of Object.entries(lock.skills)) {
    const path = await resolveEntryCanonicalPath(entry, options);
    try {
      await stat(path);
      const integrity = await computeDirIntegrity(path);
      if (integrity !== entry.integrity) {
        errors.push(`${name}: integrity mismatch (expected ${entry.integrity.slice(0, 20)}...)`);
      }
    } catch {
      errors.push(`${name}: canonical path missing (${entry.canonicalPath})`);
    }
  }
  return errors;
}

export async function lockToSkillTargets(
  lock: SkillLockfile,
  options?: { store?: string }
): Promise<Array<{ name: string; canonicalPath: string }>> {
  const store = await resolveStoreRoot(options?.store);
  const targets: Array<{ name: string; canonicalPath: string }> = [];
  for (const entry of Object.values(lock.skills)) {
    targets.push({
      name: entry.name,
      canonicalPath: await resolveEntryCanonicalPath(entry, { store }),
    });
  }
  return targets;
}

export async function purgeCanonical(name: string, options?: { store?: string }): Promise<void> {
  const store = await resolveStoreRoot(options?.store);
  const p = join(store, canonicalizeName(name));
  await rm(p, { recursive: true, force: true }).catch(() => {});
}
