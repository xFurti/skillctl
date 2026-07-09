import { rm, cp } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { RegistrySource, ResolvedSource } from '@skillctl/core';
import { ensureDir, computeDirIntegrity, resolvePathInside } from '@skillctl/core';
import { canonicalizeName } from '../names.js';
import { locateSkillDir } from '../locate-skill.js';
import { fetchCachedBuffer, extractTarball } from '../fetch/tarball.js';

export class GitHubSource implements RegistrySource {
  readonly id = 'github';

  match(spec: string): boolean {
    return (
      spec.startsWith('github:') ||
      /^https?:\/\/github\.com\//.test(spec) ||
      /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(spec)
    );
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    let ownerRepo = spec;
    let ref = options?.ref || 'HEAD';
    let subpath: string | undefined;

    if (spec.startsWith('github:')) ownerRepo = spec.slice(7);
    if (spec.startsWith('https://github.com/')) ownerRepo = spec.replace(/^https?:\/\/github\.com\//, '');

    const hashIdx = ownerRepo.indexOf('#');
    if (hashIdx !== -1) {
      const after = ownerRepo.slice(hashIdx + 1);
      ownerRepo = ownerRepo.slice(0, hashIdx);
      if (after.includes('/')) {
        const parts = after.split('/');
        if (parts[0].match(/^[0-9a-f]{7,40}$/i) || parts[0] === 'HEAD') {
          ref = parts[0];
          subpath = parts.slice(1).join('/');
        } else {
          ref = 'HEAD';
          subpath = after;
        }
      } else {
        ref = after || ref;
      }
    }

    const atIdx = ownerRepo.indexOf('@');
    if (atIdx !== -1 && !ownerRepo.includes('/@')) {
      ref = ownerRepo.slice(atIdx + 1) || ref;
      ownerRepo = ownerRepo.slice(0, atIdx);
    }

    if (ownerRepo.includes('/') && ownerRepo.split('/').length > 2) {
      const segs = ownerRepo.split('/');
      ownerRepo = segs.slice(0, 2).join('/');
      subpath = segs.slice(2).join('/') + (subpath ? '/' + subpath : '');
    }

    const [owner, repo] = ownerRepo.split('/');
    if (!owner || !repo) throw new Error(`Invalid github spec: ${spec}`);

    const nameGuess = subpath ? basename(subpath) : repo;
    const gitUrl = `https://github.com/${owner}/${repo}.git`;

    return {
      name: canonicalizeName(nameGuess),
      resolved: `github:${owner}/${repo}@${ref}${subpath ? '/' + subpath : ''}`,
      sourceType: 'github',
      sourceId: this.id,
      originalSpec: spec,
      gitUrl,
      ref,
      subpath,
    };
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    if (!resolved.gitUrl) throw new Error('bad github resolved');
    const match = resolved.gitUrl.match(/github.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) throw new Error('cannot parse github url');
    const [, owner, repo] = match;
    const ref = resolved.ref || 'HEAD';
    const url = `https://api.github.com/repos/${owner}/${repo}/tarball/${encodeURIComponent(ref)}`;
    const ghDlKey = `gh-${owner}-${repo}-${encodeURIComponent(ref).slice(0, 32)}`;
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3.raw' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const immutableRef = /^[0-9a-f]{40}$/i.test(ref);

    const buf = await fetchCachedBuffer(ghDlKey, url, headers, { cache: immutableRef });
    const tmpExtract = join(tmpdir(), `skillctl-gh-${randomUUID()}`);
    await ensureDir(tmpExtract);
    try {
      await extractTarball(buf, tmpExtract, 1);

      let sourceDir = tmpExtract;
      if (resolved.subpath) {
        const candidate = resolvePathInside(tmpExtract, resolved.subpath, 'GitHub skill subpath');
        try {
          const { stat } = await import('node:fs/promises');
          const st = await stat(candidate);
          if (!st.isDirectory()) throw new Error('not a directory');
          sourceDir = candidate;
        } catch (err) {
          throw new Error(`GitHub skill subpath not found: ${resolved.subpath}`, { cause: err });
        }
      }

      const located = await locateSkillDir(sourceDir);
      await ensureDir(dest);
      await cp(located, dest, { recursive: true, force: true });
    } finally {
      await rm(tmpExtract, { recursive: true, force: true }).catch(() => {});
    }

    return { integrity: await computeDirIntegrity(dest) };
  }
}
