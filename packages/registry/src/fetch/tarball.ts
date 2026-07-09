import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import * as tar from 'tar';
import { getCachedDownload, putCachedDownload } from '@skillctl/core';
import { httpsGet } from './https.js';

export function computeSha1(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex');
}

export async function fetchCachedBuffer(
  key: string,
  url: string,
  headers?: Record<string, string>,
  options: { cache?: boolean } = {}
): Promise<Buffer> {
  if (options.cache !== false) {
    const cached = await getCachedDownload(key);
    if (cached) return readFile(cached);
  }

  const buf = await httpsGet(url, headers);
  if (options.cache === false) return buf;

  const tmp = join(tmpdir(), `skillctl-dl-${randomUUID()}.tgz`);
  await writeFile(tmp, buf);
  await putCachedDownload(key, tmp).catch(() => {});
  await rm(tmp, { force: true }).catch(() => {});
  return buf;
}

export async function extractTarball(buf: Buffer, dest: string, strip = 1): Promise<void> {
  const tarTmp = `${dest}.tar.gz`;
  try {
    await writeFile(tarTmp, buf);
    let entries = 0;
    let expandedBytes = 0;
    await tar.list({
      file: tarTmp,
      strict: true,
      onReadEntry(entry) {
        entries++;
        expandedBytes += entry.size || 0;
        const parts = entry.path.replace(/\\/g, '/').split('/');
        if (entry.path.startsWith('/') || /^[A-Za-z]:/.test(entry.path) || parts.includes('..')) {
          throw new Error(`Unsafe tar entry path: ${entry.path}`);
        }
        if (entries > 10_000 || expandedBytes > 200 * 1024 * 1024) {
          throw new Error('Tarball exceeds extraction limits');
        }
      },
    });
    await tar.extract({ file: tarTmp, cwd: dest, strip, preservePaths: false, strict: true });
  } finally {
    await rm(tarTmp, { force: true }).catch(() => {});
  }
}
