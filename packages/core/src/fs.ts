import { readFile, writeFile, mkdir, rename, stat, readdir, lstat, readlink, rm } from 'node:fs/promises';
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
  try {
    await writeFile(tmp, data);
    await rename(tmp, filePath);
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
  }
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
 * PR12 Performance: callers use getDirStatSignature + stored integrity (from lock/cache)
 * to fast-skip full re-hash when mtime/size/count unchanged (drift detection).
 * Only re-compute SHA on add --force or detected change. Cache uses integrity key.
 * Always full content hash for correctness of integrity value.
 */
export async function computeDirIntegrity(dir: string): Promise<string> {
  const files: string[] = [];
  await walk(dir, files);
  files.sort(); // deterministic
  const hash = createHash('sha256');
  for (const f of files) {
    const fileStat = await lstat(f);
    hash.update(f.slice(dir.length)); // relative
    hash.update('\0');
    if (fileStat.isSymbolicLink()) {
      hash.update('symlink\0');
      hash.update(await readlink(f));
    } else {
      const buf = await readFile(f);
      hash.update('file\0');
      hash.update(buf);
    }
    hash.update('\0');
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
    } else if (e.isFile() || e.isSymbolicLink()) {
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
