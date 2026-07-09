import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { resolvePathInside } from '@skillctl/core';

export async function hasSkillMd(d: string): Promise<boolean> {
  for (const name of ['SKILL.md', 'skill.md']) {
    try {
      const st = await stat(join(d, name));
      if (st.isFile()) return true;
    } catch {
      // continue
    }
  }
  return false;
}

export async function findFirstSkillMd(dir: string, maxDepth: number, depth = 0): Promise<string | null> {
  if (depth > maxDepth) return null;
  try {
    const ents = await readdir(dir, { withFileTypes: true });
    for (const e of ents) {
      const p = join(dir, e.name);
      if (e.isFile() && (e.name === 'SKILL.md' || e.name === 'skill.md')) return p;
      if (e.isDirectory() && !e.name.startsWith('.')) {
        const rec = await findFirstSkillMd(p, maxDepth, depth + 1);
        if (rec) return rec;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function locateSkillDir(
  root: string,
  options?: { packageJsonHints?: string[] }
): Promise<string> {
  if (options?.packageJsonHints?.length) {
    for (const h of options.packageJsonHints) {
      const cand = resolvePathInside(root, h, 'package skill hint');
      try {
        const st = await stat(cand);
        if (st.isDirectory() && (await hasSkillMd(cand))) return cand;
      } catch {
        // continue
      }
    }
  }

  if (await hasSkillMd(root)) return root;

  const skillsSub = join(root, 'skills');
  if (await hasSkillMd(skillsSub)) return skillsSub;

  try {
    const subs = await readdir(skillsSub, { withFileTypes: true });
    for (const s of subs) {
      if (s.isDirectory()) {
        const subp = join(skillsSub, s.name);
        if (await hasSkillMd(subp)) return subp;
      }
    }
  } catch {
    // no skills dir
  }

  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.')) {
        const sub = join(root, e.name);
        if (await hasSkillMd(sub)) return sub;
      }
    }
  } catch {
    // ignore
  }

  const found = await findFirstSkillMd(root, 2);
  if (found) return dirname(found);

  return root;
}

export async function packageJsonSkillHints(extractedRoot: string): Promise<string[]> {
  const hints: string[] = [];
  try {
    const pkgRaw = await readFile(join(extractedRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    if (pkg.agentSkills) {
      if (typeof pkg.agentSkills === 'string') hints.push(pkg.agentSkills);
      else if (Array.isArray(pkg.agentSkills.skills)) hints.push(...pkg.agentSkills.skills);
      else if (Array.isArray(pkg.agentSkills)) hints.push(...pkg.agentSkills);
    }
    if (pkg.skills) {
      if (typeof pkg.skills === 'string') hints.push(pkg.skills);
      else if (Array.isArray(pkg.skills)) hints.push(...pkg.skills);
    }
  } catch {
    // no package.json
  }
  return hints;
}
