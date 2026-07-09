import { rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import semver from 'semver';
import type { RegistrySource, ResolvedSource } from '@skillctl/core';
import { ensureDir, computeDirIntegrity } from '@skillctl/core';
import { canonicalizeName } from '../names.js';
import { locateSkillDir, packageJsonSkillHints } from '../locate-skill.js';
import { parseSkillFrontmatterAsync } from '../frontmatter.js';
import { httpsGet } from '../fetch/https.js';
import { fetchCachedBuffer, extractTarball, computeSha1 } from '../fetch/tarball.js';

export class NpmSource implements RegistrySource {
  readonly id = 'npm';

  match(spec: string): boolean {
    return spec.startsWith('npm:');
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    let pkg = spec;
    let range = 'latest';
    if (spec.startsWith('npm:')) pkg = spec.slice(4);

    const at = pkg.lastIndexOf('@');
    if (at > 0 && !pkg.slice(0, at).endsWith('@')) {
      range = pkg.slice(at + 1) || 'latest';
      pkg = pkg.slice(0, at);
    }
    if (options?.ref) range = options.ref;

    const metaUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
    let metaBuf: Buffer;
    try {
      metaBuf = await httpsGet(metaUrl, { Accept: 'application/json' });
    } catch (e) {
      throw new Error(`npm registry fetch failed for ${pkg}: ${(e as Error).message}`);
    }
    const meta = JSON.parse(metaBuf.toString('utf8'));
    if (meta.error) throw new Error(`npm error: ${meta.error}`);

    let version: string;
    if (meta['dist-tags']?.[range]) {
      version = meta['dist-tags'][range];
    } else if (semver.validRange(range)) {
      const best = semver.maxSatisfying(Object.keys(meta.versions || {}), range);
      if (!best) throw new Error(`No version satisfying ${range} for ${pkg}`);
      version = best;
    } else {
      throw new Error(`Unknown npm dist-tag or invalid semver range: ${range}`);
    }

    const pkgInfo = meta.versions[version];
    if (!pkgInfo) throw new Error(`Version ${version} not in metadata`);

    return {
      name: canonicalizeName(pkg.split('/').pop() || pkg),
      resolved: `npm:${pkg}@${version}`,
      sourceType: 'npm',
      sourceId: this.id,
      originalSpec: spec,
      tarballUrl: pkgInfo.dist.tarball,
      tarballHash: pkgInfo.dist.integrity || pkgInfo.dist.shasum,
      ref: version,
    };
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    if (!resolved.tarballUrl) throw new Error('Invalid npm resolved, no tarballUrl');

    const dlKey = resolved.tarballHash
      ? `npm-${resolved.tarballHash}`
      : `npm-${createHash('sha256').update(resolved.tarballUrl).digest('hex').slice(0, 16)}`;

    const tarBuf = await fetchCachedBuffer(dlKey, resolved.tarballUrl);

    verifyNpmIntegrity(tarBuf, resolved.tarballHash);

    const tmpBase = join(tmpdir(), `skillctl-npm-${randomUUID()}`);
    await ensureDir(tmpBase);
    try {
      await extractTarball(tarBuf, tmpBase, 1);

      const hints = await packageJsonSkillHints(tmpBase);
      const located = await locateSkillDir(tmpBase, { packageJsonHints: hints });
      await parseSkillFrontmatterAsync(located);

      await ensureDir(dest);
      await cp(located, dest, { recursive: true, force: true });
    } finally {
      await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
    }

    return { integrity: await computeDirIntegrity(dest) };
  }
}

function verifyNpmIntegrity(buf: Buffer, expected?: string): void {
  if (!expected) throw new Error('npm metadata did not provide tarball integrity');
  if (/^[0-9a-f]{40}$/i.test(expected)) {
    const got = computeSha1(buf);
    if (got.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`npm tarball integrity mismatch: expected ${expected} got ${got}`);
    }
    return;
  }

  const sri = /^([a-z0-9]+)-([A-Za-z0-9+/=]+)$/i.exec(expected);
  if (!sri) throw new Error(`Unsupported npm tarball integrity: ${expected}`);
  const got = createHash(sri[1]).update(buf).digest('base64');
  if (got !== sri[2]) {
    throw new Error(`npm tarball integrity mismatch for ${sri[1]}`);
  }
}
