import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { hasSkillMd } from './skill-md.js';

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
      if (await hasSkillMd(localPath)) {
        entries.push({ name: item.name, localPath });
      }
    }
  } catch {
    // missing dir
  }
  return entries;
}

/** @deprecated Use scanSkillsDir */
export const scanAgentsSkillsDir = scanSkillsDir;
