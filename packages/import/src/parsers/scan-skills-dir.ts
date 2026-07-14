import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSkillDirectory } from '@skillctl/core';

export interface DirSkillEntry {
  name: string;
  localPath: string;
}

export async function scanSkillsDir(dir: string): Promise<DirSkillEntry[]> {
  const entries: DirSkillEntry[] = [];
  try {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if ((!item.isDirectory() && !item.isSymbolicLink()) || item.name.startsWith('.')) continue;
      const localPath = join(dir, item.name);
      const parsed = await parseSkillDirectory(localPath, { validation: 'collect' }).catch(() => null);
      if (parsed) entries.push({ name: parsed.name, localPath });
    }
  } catch {
    // missing dir
  }
  return entries;
}

/** @deprecated Use scanSkillsDir */
export const scanAgentsSkillsDir = scanSkillsDir;
