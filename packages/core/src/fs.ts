import { readFile, writeFile, mkdir, rename, stat, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { LinkMode } from './types.js';

/**
 * FS utilities (PR2 scope): atomic writes, dir hashing (fast mtime+size path + full sha),
 * cross platform notes. Minimal impl; expanded in later PRs (proper-lockfile etc).
 */

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * Atomic write: write to temp then rename.
 */
export async function writeFileAtomic(filePath: string, data: string | Buffer): Promise<void> {
  await ensureDir(dirname(filePath));
  const tmp = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await writeFile(tmp, data);
  await rename(tmp, filePath);
}

/**
 * Compute sha256 of a file (for single files).
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  const hash = createHash('sha256').update(buf).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Recursive dir hash for skill canonical dir.
 * Fast path: if mtime+size stable use cached, else full tree sha256 of contents (excluding .git etc).
 * For MVP: always compute full content hash of SKILL.md + key files.
 */
export async function computeDirIntegrity(dir: string): Promise<string> {
  const files: string[] = [];
  await walk(dir, files);
  files.sort(); // deterministic
  const hash = createHash('sha256');
  for (const f of files) {
    try {
      const buf = await readFile(f);
      hash.update(f.slice(dir.length)); // relative
      hash.update('\0');
      hash.update(buf);
      hash.update('\0');
    } catch {
      // ignore unreadable
    }
  }
  return `sha256:${hash.digest('hex')}`;
}

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p, out);
    } else if (e.isFile()) {
      out.push(p);
    }
  }
}

/**
 * Fast stat based check (used for drift detection in doctor etc).
 */
export async function getDirStatSignature(dir: string): Promise<{ mtime: number; size: number; count: number }> {
  let size = 0;
  let count = 0;
  let latestMtime = 0;
  await walkStats(dir, (s) => {
    size += s.size;
    count += 1;
    if (s.mtimeMs > latestMtime) latestMtime = s.mtimeMs;
  });
  return { mtime: latestMtime, size, count };
}

async function walkStats(dir: string, cb: (s: { size: number; mtimeMs: number }) => void): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.name === '.git') continue;
    const p = join(dir, e.name);
    try {
      const s = await stat(p);
      if (s.isDirectory()) {
        await walkStats(p, cb);
      } else if (s.isFile()) {
        cb({ size: s.size, mtimeMs: s.mtimeMs });
      }
    } catch {}
  }
}

export function getDefaultLinkMode(): LinkMode {
  return process.platform === 'win32' ? 'junction' : 'symlink';
}
