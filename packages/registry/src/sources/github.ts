import { rm, cp } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { RegistrySource, ResolvedSource } from '@skillctl/core';
import { ensureDir, computeDirIntegrity, resolvePathInside } from '@skillctl/core';
import { canonicalizeName } from '../names.js';
import { locateSkillDir, locateSkillDirByName } from '../locate-skill.js';
import { fetchCachedBuffer, extractTarball } from '../fetch/tarball.js';
import { defaultHttpClient, type HttpClient } from '../fetch/https.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;

export class GitHubSource implements RegistrySource {
  readonly id = 'github';

  constructor(private readonly httpClient: HttpClient = defaultHttpClient) {}

  match(spec: string): boolean {
    return (
      spec.startsWith('github:') ||
      /^https?:\/\/github\.com\//.test(spec) ||
      /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(spec)
    );
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    const parsed = parseGitHubSpecifier(spec);
    const requestedRef = options?.ref || parsed.ref || 'HEAD';
    const commit = FULL_SHA.test(requestedRef)
      ? requestedRef.toLowerCase()
      : await this.resolveCommit(parsed.owner, parsed.repo, requestedRef);
    const nameGuess = parsed.subpath ? basename(parsed.subpath) : parsed.repo;

    return {
      name: canonicalizeName(nameGuess),
      resolved: formatResolved(parsed.owner, parsed.repo, commit, parsed.subpath),
      sourceType: 'github',
      sourceId: this.id,
      originalSpec: spec,
      gitUrl: `https://github.com/${parsed.owner}/${parsed.repo}.git`,
      ref: commit,
      requestedRef,
      subpath: parsed.subpath,
    };
  }

  private async resolveCommit(owner: string, repo: string, ref: string): Promise<string> {
    const headers = githubHeaders();
    headers.Accept = 'application/vnd.github+json';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`;
    const response = await this.httpClient.get(url, { headers, maxBytes: 2 * 1024 * 1024 });
    if (response.status !== 200) {
      throw new Error(`GitHub ref resolution failed (${response.status}) for ${owner}/${repo}@${ref}`);
    }
    let sha: unknown;
    try {
      sha = (JSON.parse(response.body.toString('utf8')) as { sha?: unknown }).sha;
    } catch (err) {
      throw new Error(`GitHub returned invalid JSON for ${owner}/${repo}@${ref}`, { cause: err });
    }
    if (typeof sha !== 'string' || !FULL_SHA.test(sha)) {
      throw new Error(`GitHub did not return an immutable commit for ${owner}/${repo}@${ref}`);
    }
    return sha.toLowerCase();
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    if (!resolved.gitUrl) throw new Error('bad github resolved');
    const match = resolved.gitUrl.match(/github.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) throw new Error('cannot parse github url');
    const [, owner, repo] = match;
    const commit = resolved.ref;
    if (!commit || !FULL_SHA.test(commit)) {
      throw new Error(`Refusing mutable GitHub fetch: ${commit || 'missing ref'}`);
    }
    const url = `https://api.github.com/repos/${owner}/${repo}/tarball/${commit}`;
    const key = `gh-${owner}-${repo}-${commit}`;
    const buf = await fetchCachedBuffer(key, url, githubHeaders(), {
      cache: true,
      httpClient: this.httpClient,
    });
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
      const located = resolved.skillSelector
        ? await locateSkillDirByName(sourceDir, resolved.skillSelector)
        : await locateSkillDir(sourceDir);
      await ensureDir(dest);
      await cp(located, dest, { recursive: true, force: true });
    } finally {
      await rm(tmpExtract, { recursive: true, force: true }).catch(() => {});
    }
    return { integrity: await computeDirIntegrity(dest) };
  }
}

interface ParsedGitHubSpecifier {
  owner: string;
  repo: string;
  ref?: string;
  subpath?: string;
}

export function parseGitHubSpecifier(spec: string): ParsedGitHubSpecifier {
  let raw = spec.trim();
  if (raw.startsWith('github:')) raw = raw.slice(7);
  raw = raw.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');

  const hashIndex = raw.indexOf('#');
  let subpath = hashIndex >= 0 ? raw.slice(hashIndex + 1) : undefined;
  if (hashIndex >= 0) raw = raw.slice(0, hashIndex);

  const segments = raw.split('/').filter(Boolean);
  if (segments.length < 2) throw new Error(`Invalid github spec: ${spec}`);
  const owner = segments[0];
  let repoAndRef = segments[1];
  const legacySubpath = segments.slice(2).join('/');

  const atIndex = repoAndRef.lastIndexOf('@');
  let ref: string | undefined;
  if (atIndex > 0) {
    ref = repoAndRef.slice(atIndex + 1) || undefined;
    repoAndRef = repoAndRef.slice(0, atIndex);
  }
  const repo = repoAndRef;
  if (!subpath && legacySubpath) subpath = legacySubpath;
  subpath = subpath?.replace(/^\/+|\/+$/g, '') || undefined;
  if (!owner || !repo) throw new Error(`Invalid github spec: ${spec}`);
  return { owner, repo, ref, subpath };
}

function formatResolved(owner: string, repo: string, commit: string, subpath?: string): string {
  return `github:${owner}/${repo}@${commit}${subpath ? `#${subpath}` : ''}`;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3.raw' };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
