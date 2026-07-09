import { readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { AuditFinding } from '../types.js';

async function walkAll(dir: string, out: string[]): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.')) await walkAll(p, out);
      else if (e.isFile() && /\.(md|txt|sh|py|js|ts|json)$/i.test(e.name)) out.push(p);
    }
  } catch {
    // ignore
  }
}

export async function checkPathTraversal(skillName: string, canonicalPath: string): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const files: string[] = [];
  await walkAll(canonicalPath, files);
  await inspectSymlinks(canonicalPath, canonicalPath, skillName, findings);

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf8');
      if (/\.\.\//.test(content) || /\/etc\/passwd/.test(content)) {
        findings.push({
          rule: 'path-traversal',
          severity: 'warning',
          skill: skillName,
          message: 'Possible path traversal reference in file content',
          path: file,
        });
      }
    } catch {
      // ignore
    }
  }
  return findings;
}

async function inspectSymlinks(
  root: string,
  dir: string,
  skillName: string,
  findings: AuditFinding[]
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      try {
        const target = await realpath(path);
        const rel = relative(resolve(root), target);
        const escapes = rel.startsWith('..') || isAbsolute(rel);
        findings.push({
          rule: 'path-traversal',
          severity: escapes ? 'error' : 'warning',
          skill: skillName,
          message: escapes ? 'Symbolic link escapes the skill directory' : 'Symbolic link present in skill',
          path,
        });
      } catch {
        findings.push({
          rule: 'path-traversal',
          severity: 'error',
          skill: skillName,
          message: 'Broken or unreadable symbolic link',
          path,
        });
      }
    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await inspectSymlinks(root, path, skillName, findings);
    }
  }
}
