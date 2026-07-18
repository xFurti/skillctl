import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import * as tar from 'tar';
import { getCachedDownload, putCachedDownload } from '@leogriel/core';
import { defaultHttpClient, type HttpClient } from './https.js';

export function computeSha1(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex');
}

export async function fetchCachedBuffer(
  key: string,
  url: string,
  headers?: Record<string, string>,
  options: { cache?: boolean; httpClient?: HttpClient } = {}
): Promise<Buffer> {
  if (options.cache !== false) {
    const cached = await getCachedDownload(key);
    if (cached) return readFile(cached);
  }

  const response = await (options.httpClient || defaultHttpClient).get(url, { headers });
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${url}`);
  const buf = response.body;
  if (options.cache === false) return buf;

  const tmp = join(tmpdir(), `leogriel-dl-${randomUUID()}.tgz`);
  await writeFile(tmp, buf);
  await putCachedDownload(key, tmp).catch(() => {});
  await rm(tmp, { force: true }).catch(() => {});
  return buf;
}

export interface ExtractTarballOptions {
  includePath?: string;
}

export async function extractTarball(
  buf: Buffer,
  dest: string,
  strip = 1,
  options: ExtractTarballOptions = {},
): Promise<void> {
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
    await tar.extract({
      file: tarTmp,
      cwd: dest,
      strip,
      preservePaths: false,
      strict: true,
      filter: (path) => tarEntryMatchesIncludePath(path, strip, options.includePath),
    });
  } finally {
    await rm(tarTmp, { force: true }).catch(() => {});
  }
}

export function tarEntryMatchesIncludePath(path: string, strip: number, includePath?: string): boolean {
  if (!includePath) return true;
  const entryParts = path.replace(/\\/g, '/').split('/').filter(Boolean).slice(strip);
  const includeParts = includePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (!includeParts.length || includeParts.includes('..')) return false;
  if (entryParts.length < includeParts.length) return false;
  return includeParts.every((part, index) => entryParts[index] === part);
}
