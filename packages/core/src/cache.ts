import { cp, mkdir, stat, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { getDirStatSignature } from './fs.js';

/**
 * Content-addressable cache for performance (PR12).
 * Located at ~/.skillctl/cache/
 * Keyed by integrity (sha256:<hex> -> strip prefix for dir name under cache/).
 * Used to skip re-extract / reuse identical skill trees across adds/installs.
 * Also supports raw download cache for tarballs keyed by their known hash/shasum.
 *
 * Integrates with registry fetch/materialize and fs integrity.
 * Fast-path stat checks for drift before full re-hash.
 */

const CACHE_ROOT = join(homedir(), '.skillctl', 'cache');
const DOWNLOAD_CACHE = join(CACHE_ROOT, 'downloads'); // for raw tarballs etc.

export function getCacheDir(): string {
  return CACHE_ROOT;
}

export function getDownloadCacheDir(): string {
  return DOWNLOAD_CACHE;
}

export async function ensureCacheDir(sub?: string): Promise<string> {
  const d = sub ? join(CACHE_ROOT, sub) : CACHE_ROOT;
  await mkdir(d, { recursive: true });
  return d;
}

export function cacheKeyFromIntegrity(integrity: string): string {
  const match = /^sha256:([0-9a-f]{64})$/i.exec(integrity);
  if (!match) throw new Error(`Invalid cache integrity key: ${integrity}`);
  return match[1].toLowerCase();
}

function safeDownloadKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Return path to cached extracted skill dir for this integrity, or null.
 */
export async function getCachedSkill(integrity: string): Promise<string | null> {
  const key = cacheKeyFromIntegrity(integrity);
  const p = join(CACHE_ROOT, key);
  try {
    const st = await stat(p);
    if (st.isDirectory()) {
      // quick sanity: has something
      const ents = await readdir(p);
      if (ents.length > 0) return p;
    }
  } catch {
    // not present
  }
  return null;
}

/**
 * Store a materialized skill dir into content-addressable cache.
 * Returns the cache path. Idempotent.
 */
export async function putCachedSkill(integrity: string, srcDir: string): Promise<string> {
  const key = cacheKeyFromIntegrity(integrity);
  const dest = join(CACHE_ROOT, key);
  await ensureCacheDir();
  // if already there, optionally validate but for perf just return
  try {
    const st = await stat(dest);
    if (st.isDirectory()) return dest;
  } catch {}
  await cp(srcDir, dest, { recursive: true, force: true });
  return dest;
}

/**
 * Cache a raw download (e.g. tarball) by a content or source key (sha1/shasum or hash of url).
 * key should be stable short hex.
 */
export async function getCachedDownload(key: string): Promise<string | null> {
  await ensureCacheDir('downloads');
  const p = join(DOWNLOAD_CACHE, safeDownloadKey(key));
  try {
    const st = await stat(p);
    if (st.isFile()) return p;
  } catch {}
  return null;
}

export async function putCachedDownload(key: string, srcFile: string): Promise<string> {
  await ensureCacheDir('downloads');
  const dest = join(DOWNLOAD_CACHE, safeDownloadKey(key));
  await cp(srcFile, dest, { force: true });
  return dest;
}

/**
 * Optional cleanup (for doctor --gc or manual).
 */
export async function clearCache(olderThanMs?: number): Promise<number> {
  let removed = 0;
  try {
    const root = await readdir(CACHE_ROOT, { withFileTypes: true }).catch(() => []);
    for (const e of root) {
      const p = join(CACHE_ROOT, e.name);
      if (olderThanMs) {
        try {
          const s = await stat(p);
          if (Date.now() - s.mtimeMs > olderThanMs) {
            await rm(p, { recursive: true, force: true });
            removed++;
          }
        } catch {}
      } else {
        await rm(p, { recursive: true, force: true }).catch(() => {});
        removed++;
      }
    }
  } catch {}
  return removed;
}

/**
 * Fast-path stat signature check against a previous signature.
 * Returns true if mtime/size/count match (no content drift likely).
 * Caller can still do full integrity if needed for security.
 */
export async function matchesStatSignature(dir: string, prev: { mtime: number; size: number; count: number }): Promise<boolean> {
  try {
    const cur = await getDirStatSignature(dir);  // reuse from fs, but to avoid cycle import here redef minimal? wait we'll import in use or duplicate helper
    return cur.mtime === prev.mtime && cur.size === prev.size && cur.count === prev.count;
  } catch {
    return false;
  }
}

// Note: getDirStatSignature is in fs.ts; to avoid circular, we will call from places after or re-export.
