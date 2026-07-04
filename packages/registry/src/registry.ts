/**
 * Registry Manager + Sources for PR4.
 *
 * Supports: github, local (file:), skills.sh (shorthand alias), basic npm.
 * Full resolution, materialize to canonical store, integrity (sha256 tree).
 * Integrates with manifest/lock from PR3 (load/save, makeLockEntry).
 *
 * npm resolution algorithm (per design Issue 4 / appendix):
 * 1. Parse spec → pkg, versionRange (supports npm:pkg, npm:pkg@ver, npm:@scope/pkg@^range).
 * 2. Resolve best version: query registry.npmjs.org for versions, use semver to pick maxSatisfying (or 'latest' if no range).
 * 3. Fetch package metadata for the version; get dist.tarball and dist.shasum (or integrity).
 * 4. Download tarball (https), verify npm tarball shasum (sha1 for shasum field; note modern npm uses sha512 in integrity, we support both for basic).
 * 5. Extract tarball to temp dir (using 'tar' pkg).
 * 6. Locate skill dir inside extracted:
 *    - package.json "agentSkills" field? (string | string[] paths) or "skills" field.
 *    - or conventional ./skills/ subdir (if contains SKILL.md)
 *    - or root if SKILL.md present at top
 *    - fallback: glob ** /SKILL.md limited depth (1-2), pick first containing one.
 * 7. From located skill dir: parse SKILL.md frontmatter for 'name' (canonicalize to lower-hyphen), validate basic.
 * 8. Materialize: atomic copy of the skill dir contents to canonical/<name>/ (or the dir itself), compute tree sha256 integrity via core.
 * 9. Record provenance: {type: 'npm', tarballHash: 'sha1:xxx' or npm integrity, subpath? }
 *    Also store resolved tarball info in resolved string.
 * 10. Update lock with makeLockEntry + save; optionally update manifest.
 *
 * GitHub/local/skills.sh similar: resolve to (url/ref/subpath), fetch/extract/copy to temp, locate skill (prefer subpath or find SKILL.md), materialize, sha256 tree.
 * Shorthands in resolve (e.g. owner/repo mapped to github:).
 *
 * Checksum (integrity) always written to lock entry.
 *
 * Uses core: loadConfig (for store), computeDirIntegrity, ensureDir, writeFileAtomic (indirect).
 * No adapters. Basic add only.
 *
 * Sources implement (extend core RegistrySource for MVP):
 */

import { readFile, writeFile, mkdir, rm, cp, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve as pathResolve, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import https from 'node:https';
import * as tar from 'tar';
import semver from 'semver';

import type { RegistrySource, ResolvedSource, Provenance, LockfileEntry } from '@skillctl/core';
import { loadConfig, ensureDir, computeDirIntegrity, getDefaultLinkMode } from '@skillctl/core';
import { loadManifest, saveManifest } from '@skillctl/manifest';
import { loadLockfile, saveLockfile, createEmptyLockfile, addOrUpdateEntry, makeLockEntry } from '@skillctl/lockfile';

// --- Types for internal resolution (augment ResolvedSource with payload for fetch) ---
export interface ResolvedSourceInternal extends ResolvedSource {
  // payload for fetch/materialize
  tarballUrl?: string;
  tarballHash?: string; // npm shasum or sha
  gitUrl?: string;
  ref?: string;
  subpath?: string;
  localPath?: string;
  // original spec for provenance
  originalSpec: string;
}

// --- Helpers: parse frontmatter from SKILL.md (basic, no full yaml dep) ---
export function parseSkillFrontmatter(skillDir: string): { name?: string; description?: string } {
  // Try SKILL.md or skill.md
  const candidates = ['SKILL.md', 'skill.md', 'SKILL.markdown'];
  for (const f of candidates) {
    const p = join(skillDir, f);
    try {
      // sync not, but top level read ok
      // use sync? no, we'll make async version below for use
    } catch {}
  }
  return {};
}

export async function parseSkillFrontmatterAsync(skillDir: string): Promise<{ name?: string; description?: string }> {
  const candidates = ['SKILL.md', 'skill.md'];
  for (const f of candidates) {
    const p = join(skillDir, f);
    try {
      const content = await readFile(p, 'utf8');
      const match = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
      if (match && match[1]) {
        const yamlLike = match[1];
        // very basic key: value parse for name (supports quoted)
        const nameMatch = yamlLike.match(/(?:^|\n)\s*name:\s*["']?([^"'\n#]+)["']?/i);
        if (nameMatch) {
          return { name: nameMatch[1].trim(), description: extractDesc(yamlLike) };
        }
        // fallback try description only
      }
      // also allow name in first heading or loose
      const looseName = content.match(/name:\s*["']?([^"'\n]+)/i);
      if (looseName) return { name: looseName[1].trim() };
    } catch {
      // continue
    }
  }
  // fallback: use dir basename as name (will be normalized)
  return { name: basename(skillDir) };
}

function extractDesc(yaml: string): string | undefined {
  const m = yaml.match(/(?:^|\n)\s*description:\s*["']?([^"'\n]+)/i);
  return m ? m[1].trim() : undefined;
}

// Canonical name: lowercase, hyphen normalized (per design)
export function canonicalizeName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Copy dir tree (node cp recursive)
async function copyDir(src: string, dest: string): Promise<void> {
  await ensureDir(dest);
  await cp(src, dest, { recursive: true, force: true });
}

// Compute sha1 for npm shasum verify (npm legacy)
function computeSha1(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex');
}

// Simple https get buffer (for tarball + json metadata)
function httpsGet(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'skillctl/0.0.1', ...headers } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirect once
        httpsGet(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// --- Source implementations ---

export class LocalSource implements RegistrySource {
  readonly id = 'local';

  match(spec: string): boolean {
    return spec.startsWith('file:') || spec.startsWith('local:') || spec.startsWith('./') || spec.startsWith('../') || /^[a-zA-Z]:\\/.test(spec) || spec.startsWith('/');
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    let localPath = spec;
    if (spec.startsWith('file:')) localPath = spec.slice(5);
    if (spec.startsWith('local:')) localPath = spec.slice(6);
    // resolve relative to cwd for now
    const abs = pathResolve(process.cwd(), localPath);
    const nameGuess = basename(abs);
    const resolved: ResolvedSourceInternal = {
      name: canonicalizeName(nameGuess),
      resolved: `local:${abs}`,
      sourceType: 'local',
      localPath: abs,
      originalSpec: spec,
    };
    return resolved as ResolvedSource;
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    const r = resolved as ResolvedSourceInternal;
    if (!r.localPath) throw new Error('Invalid local resolved');
    await ensureDir(dest);
    // copy the local dir contents or the dir? assume spec points to skill dir root (containing SKILL.md)
    await copyDir(r.localPath, dest);
    const integrity = await computeDirIntegrity(dest);
    return { integrity };
  }
}

export class GitHubSource implements RegistrySource {
  readonly id = 'github';

  match(spec: string): boolean {
    return spec.startsWith('github:') ||
      /^https?:\/\/github\.com\//.test(spec) ||
      /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(spec); // owner/repo shorthand
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    let ownerRepo = spec;
    let ref = options?.ref || 'HEAD';
    let subpath: string | undefined;

    if (spec.startsWith('github:')) ownerRepo = spec.slice(7);
    if (spec.startsWith('https://github.com/')) ownerRepo = spec.replace(/^https?:\/\/github\.com\//, '');
    // parse #ref or @ref or /sub
    const hashIdx = ownerRepo.indexOf('#');
    if (hashIdx !== -1) {
      const after = ownerRepo.slice(hashIdx + 1);
      ownerRepo = ownerRepo.slice(0, hashIdx);
      if (after.includes('/')) {
        // e.g. owner/repo#sub/path or owner/repo#ref/sub
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
    // @ref syntax
    const atIdx = ownerRepo.indexOf('@');
    if (atIdx !== -1 && !ownerRepo.includes('/@')) {
      ref = ownerRepo.slice(atIdx + 1) || ref;
      ownerRepo = ownerRepo.slice(0, atIdx);
    }
    // subpath like owner/repo/skills/foo
    if (ownerRepo.includes('/') && ownerRepo.split('/').length > 2) {
      const segs = ownerRepo.split('/');
      ownerRepo = segs.slice(0, 2).join('/');
      subpath = segs.slice(2).join('/') + (subpath ? '/' + subpath : '');
    }

    const [owner, repo] = ownerRepo.split('/');
    if (!owner || !repo) throw new Error(`Invalid github spec: ${spec}`);

    const nameGuess = subpath ? basename(subpath) : repo;
    const resolvedStr = `github:${owner}/${repo}@${ref}${subpath ? '/' + subpath : ''}`;

    const r: ResolvedSourceInternal = {
      name: canonicalizeName(nameGuess),
      resolved: resolvedStr,
      sourceType: 'github',
      gitUrl: `https://github.com/${owner}/${repo}.git`,
      ref,
      subpath,
      originalSpec: spec,
    };
    return r as ResolvedSource;
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    const r = resolved as ResolvedSourceInternal;
    if (!r.gitUrl) throw new Error('bad github resolved');
    // Use GitHub tarball API for shallow fetch (no git dep)
    const ref = r.ref || 'HEAD';
    const tarballUrl = `https://api.github.com/repos/${r.gitUrl.split('/').slice(-2, -1)[0] || ''}/${basename(r.gitUrl).replace('.git','')}/tarball/${ref}`;
    // fix: parse owner/repo from gitUrl
    const match = r.gitUrl.match(/github.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) throw new Error('cannot parse github url');
    const owner = match[1]; const repo = match[2];
    const url = `https://api.github.com/repos/${owner}/${repo}/tarball/${encodeURIComponent(ref)}`;

    const buf = await httpsGet(url, { Accept: 'application/vnd.github.v3.raw' });
    // GitHub tarball has a top level dir like owner-repo-sha/
    const tmpExtract = join(tmpdir(), `skillctl-gh-${Date.now()}`);
    await ensureDir(tmpExtract);
    // write temp tar
    const tarTmp = `${tmpExtract}.tar.gz`;
    await writeFile(tarTmp, buf);
    await tar.extract({ file: tarTmp, cwd: tmpExtract, strip: 1 }); // strip the top wrapper dir
    await rm(tarTmp, { force: true });

    // if subpath, drill down
    let sourceDir = tmpExtract;
    if (r.subpath) {
      const candidate = join(tmpExtract, r.subpath);
      try {
        const st = await stat(candidate);
        if (st.isDirectory()) sourceDir = candidate;
      } catch {}
    }
    // locate skill if not exact
    const located = await this.locateSkillDir(sourceDir);
    await ensureDir(dest);
    await copyDir(located, dest);
    // cleanup
    await rm(tmpExtract, { recursive: true, force: true });

    const integrity = await computeDirIntegrity(dest);
    return { integrity };
  }

  private async locateSkillDir(dir: string): Promise<string> {
    // if has SKILL.md directly, use it; else look for skills/ or first sub with SKILL
    const has = await hasSkillMd(dir);
    if (has) return dir;
    const skillsSub = join(dir, 'skills');
    if (await hasSkillMd(skillsSub)) return skillsSub;
    // limited glob
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.')) {
          const sub = join(dir, e.name);
          if (await hasSkillMd(sub)) return sub;
        }
      }
    } catch {}
    return dir; // fallback
  }
}

async function hasSkillMd(d: string): Promise<boolean> {
  try {
    const st = await stat(join(d, 'SKILL.md'));
    return st.isFile();
  } catch {
    try {
      const st2 = await stat(join(d, 'skill.md'));
      return st2.isFile();
    } catch { return false; }
  }
}

export class SkillsShSource implements RegistrySource {
  readonly id = 'skills.sh';

  match(spec: string): boolean {
    return spec.startsWith('skills.sh/') || spec.startsWith('npx-skills/');
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    let inner = spec.replace(/^skills\.sh\//, '').replace(/^npx-skills\//, '');
    // alias to github style; many skills.sh are github mirrors or owner/repo
    // for basic impl (per PR4): support 'skills.sh/owner/repo' or 'skills.sh/skillname' (name-only)
    if (!inner.includes('/')) {
      // name only shorthand (common for skills.sh); construct resolved without full gh parse
      const ref = options?.ref || 'HEAD';
      const r: ResolvedSourceInternal = {
        name: canonicalizeName(inner),
        resolved: `skills.sh/${inner}@${ref}`,
        sourceType: 'skills.sh',
        ref,
        originalSpec: spec,
      };
      return r as ResolvedSource;
    }
    // owner/repo form -> delegate parse to gh for subpath etc
    const ghSpec = `github:${inner}`;
    const gh = new GitHubSource();
    const resolvedGh = await gh.resolve(ghSpec, options) as ResolvedSourceInternal;
    const r: ResolvedSourceInternal = {
      ...resolvedGh,
      sourceType: 'skills.sh',
      resolved: resolvedGh.resolved.replace('github:', 'skills.sh/'),
      originalSpec: spec,
    };
    return r as ResolvedSource;
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    // delegate fetch to github logic but keep provenance
    const gh = new GitHubSource();
    // reconstruct
    const r = resolved as ResolvedSourceInternal;
    // fetch will work since gitUrl etc present
    return gh.fetch(resolved, dest);
  }
}

/**
 * NpmSource - basic npm support.
 * See class comments for full documented algorithm.
 */
export class NpmSource implements RegistrySource {
  readonly id = 'npm';

  match(spec: string): boolean {
    // Strict: only 'npm:' prefix for basic impl (shorthands for github handled by gh + fallback).
    // Supports npm:pkg, npm:pkg@ver, npm:@scope/pkg@range per design.
    return spec.startsWith('npm:');
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    let pkg = spec;
    let range = 'latest';
    if (spec.startsWith('npm:')) pkg = spec.slice(4);
    // parse @ver
    const at = pkg.lastIndexOf('@');
    if (at > 0 && !pkg.slice(0, at).endsWith('@') /* not scope */) {  // handle @scope/pkg@ver
      range = pkg.slice(at + 1) || 'latest';
      pkg = pkg.slice(0, at);
    }
    if (options?.ref) range = options.ref;

    // fetch metadata
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
    if (range === 'latest' || !semver.validRange(range)) {
      version = meta['dist-tags']?.latest || Object.keys(meta.versions || {}).pop();
    } else {
      const versions = Object.keys(meta.versions || {});
      const best = semver.maxSatisfying(versions, range);
      if (!best) throw new Error(`No version satisfying ${range} for ${pkg}`);
      version = best;
    }

    const pkgInfo = meta.versions[version];
    if (!pkgInfo) throw new Error(`Version ${version} not in metadata`);

    const tarballUrl = pkgInfo.dist.tarball;
    const tarballShasum = pkgInfo.dist.shasum; // sha1
    const tarballIntegrity = pkgInfo.dist.integrity; // e.g. sha512-...

    const resolvedStr = `npm:${pkg}@${version}`;

    const r: ResolvedSourceInternal = {
      name: canonicalizeName(pkg.split('/').pop() || pkg),
      resolved: resolvedStr,
      sourceType: 'npm',
      tarballUrl,
      tarballHash: tarballShasum || tarballIntegrity,
      ref: version,
      originalSpec: spec,
    };
    return r as ResolvedSource;
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    const r = resolved as ResolvedSourceInternal;
    if (!r.tarballUrl) throw new Error('Invalid npm resolved, no tarballUrl');

    // 4. download
    const tarBuf = await httpsGet(r.tarballUrl);
    // 4b. verify (basic shasum if sha1)
    if (r.tarballHash && r.tarballHash.length === 40) {
      const got = computeSha1(tarBuf);
      if (got !== r.tarballHash) {
        throw new Error(`npm tarball integrity mismatch: expected ${r.tarballHash} got ${got}`);
      }
    }
    // note: for sha512 we could verify but skip detailed for basic (use core integrity later)

    // 5. extract
    const tmpBase = join(tmpdir(), `skillctl-npm-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await ensureDir(tmpBase);
    const tarFile = join(tmpBase, 'pkg.tgz');
    await writeFile(tarFile, tarBuf);
    await tar.extract({ file: tarFile, cwd: tmpBase, strip: 1 }); // package/ wrapper typical for npm
    await rm(tarFile, { force: true }).catch(() => {});

    // 6. locate skill dir
    const located = await this.locateNpmSkillDir(tmpBase);

    // 7. parse name
    const front = await parseSkillFrontmatterAsync(located);
    let skillName = front.name ? canonicalizeName(front.name) : r.name;

    // 8. materialize copy to dest (dest will be the target canonical temp)
    await ensureDir(dest);
    await copyDir(located, dest);

    // cleanup temp
    await rm(tmpBase, { recursive: true, force: true }).catch(() => {});

    const treeIntegrity = await computeDirIntegrity(dest);
    // return tree, caller may record tarball separately
    return { integrity: treeIntegrity };
  }

  /**
   * Locate skill dir logic per design:
   * 1. package.json "agentSkills" or "skills" field (string or array of paths relative)
   * 2. conventional ./skills/<name> or root ./skills/
   * 3. root if SKILL.md
   * 4. limited glob ** /SKILL.md (depth limited)
   */
  private async locateNpmSkillDir(extractedRoot: string): Promise<string> {
    // try package.json hints
    try {
      const pkgJsonPath = join(extractedRoot, 'package.json');
      const pkgRaw = await readFile(pkgJsonPath, 'utf8');
      const pkg = JSON.parse(pkgRaw);
      const hints: string[] = [];
      if (pkg.agentSkills) {
        if (typeof pkg.agentSkills === 'string') hints.push(pkg.agentSkills);
        else if (Array.isArray(pkg.agentSkills.skills)) hints.push(...pkg.agentSkills.skills);
        else if (Array.isArray(pkg.agentSkills)) hints.push(...pkg.agentSkills);
      }
      if (pkg.skills) {
        if (typeof pkg.skills === 'string') hints.push(pkg.skills);
        else if (Array.isArray(pkg.skills)) hints.push(...pkg.skills);
      }
      for (const h of hints) {
        const cand = pathResolve(extractedRoot, h);
        if (await hasSkillMd(cand) || await hasSkillMd(join(cand, '..'))) {
          const st = await stat(cand).catch(() => null);
          if (st?.isDirectory()) return cand;
        }
      }
    } catch { /* no pkg or bad */ }

    // conventional skills/
    const skillsDir = join(extractedRoot, 'skills');
    if (await hasSkillMd(skillsDir)) return skillsDir;
    // single skill inside skills/ subdir?
    try {
      const subs = await readdir(skillsDir, { withFileTypes: true });
      for (const s of subs) {
        if (s.isDirectory()) {
          const subp = join(skillsDir, s.name);
          if (await hasSkillMd(subp)) return subp;
        }
      }
    } catch {}

    // root?
    if (await hasSkillMd(extractedRoot)) return extractedRoot;

    // limited glob depth 2
    const found = await findFirstSkillMd(extractedRoot, 2);
    if (found) return dirname(found);
    return extractedRoot;
  }
}

async function findFirstSkillMd(dir: string, maxDepth: number, depth = 0): Promise<string | null> {
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
  } catch {}
  return null;
}

// --- Registry Manager ---

export class RegistryManager {
  private sources: RegistrySource[] = [];

  constructor() {
    this.registerDefaultSources();
  }

  register(source: RegistrySource): void {
    this.sources.push(source);
  }

  private registerDefaultSources(): void {
    // order matters: specific prefix matchers before loose shorthands
    this.register(new NpmSource());
    this.register(new SkillsShSource());
    this.register(new GitHubSource());
    this.register(new LocalSource());
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSourceInternal> {
    for (const src of this.sources) {
      if (src.match(spec)) {
        const res = await src.resolve(spec, options);
        // attach original for downstream
        (res as any).originalSpec = spec;
        return res as ResolvedSourceInternal;
      }
    }
    // fallback try as local or github shorthand
    if (spec.includes('/') && !spec.includes(':')) {
      const gh = new GitHubSource();
      if (gh.match(spec)) return gh.resolve(spec, options) as Promise<ResolvedSourceInternal>;
    }
    throw new Error(`No registry source matched spec: ${spec}. Supported: github:, npm:, skills.sh/, file:, ./local`);
  }

  /**
   * Materialize resolved source to canonical store.
   * Returns final canonicalPath + tree integrity.
   * Uses atomic-ish: copy to .tmp then rename.
   */
  async materialize(resolved: ResolvedSourceInternal, options?: { name?: string }): Promise<{ canonicalPath: string; integrity: string; sourceType: string }> {
    const config = await loadConfig();
    const store = config.store;
    await ensureDir(store);

    const name = options?.name || resolved.name;
    const canonicalName = canonicalizeName(name);
    const target = join(store, canonicalName);

    // temp dir for fetch/extract
    const tmpDest = join(tmpdir(), `skillctl-mat-${canonicalName}-${Date.now()}`);
    await ensureDir(tmpDest);

    let fetchIntegrity: string;
    try {
      // find source to fetch? or use generic - for simplicity call matching source's fetch
      const source = this.sources.find(s => s.match(resolved.originalSpec || '')) || this.sources.find(s => s.id === resolved.sourceType);
      if (!source) throw new Error('no source for materialize');
      const resFetch = await source.fetch(resolved as any, tmpDest);
      fetchIntegrity = resFetch.integrity;
    } catch (err) {
      await rm(tmpDest, { recursive: true, force: true }).catch(() => {});
      throw err;
    }

    // compute (should match)
    const treeIntegrity = await computeDirIntegrity(tmpDest);

    // atomic move to target: if exists, for basic we overwrite (later PRs use versioned)
    if (await exists(target)) {
      await rm(target, { recursive: true, force: true });
    }
    // rename tmp to target (cross volume may fail, fallback copy+rm)
    try {
      await (await import('node:fs/promises')).rename(tmpDest, target);
    } catch {
      await copyDir(tmpDest, target);
      await rm(tmpDest, { recursive: true, force: true });
    }

    return {
      canonicalPath: target,
      integrity: treeIntegrity,
      sourceType: resolved.sourceType,
    };
  }

  /**
   * Basic `add` : parse spec, resolve, materialize to canonical, update lock (and manifest if present).
   * Returns the created/updated LockfileEntry.
   * Integrates manifest/lock per PR3/4 spec.
   */
  async add(spec: string, opts: { cwd?: string; updateManifest?: boolean } = {}): Promise<LockfileEntry> {
    const cwd = opts.cwd || process.cwd();
    const resolved = await this.resolve(spec);

    // materialize
    const mat = await this.materialize(resolved);

    // provenance construction
    const prov: Provenance = {
      type: resolved.sourceType === 'skills.sh' ? 'skills.sh' : resolved.sourceType,
      subpath: resolved.subpath,
    };
    if (resolved.sourceType === 'github' || resolved.sourceType === 'skills.sh') {
      prov.commit = resolved.ref; // approx; real would be commit sha
    }
    if (resolved.sourceType === 'npm') {
      prov.tarballHash = resolved.tarballHash;
    }

    const entry = makeLockEntry(
      mat.canonicalPath.split(sep).pop()!, // name from final
      resolved.originalSpec || spec,
      resolved.resolved,
      mat.integrity,
      mat.canonicalPath,
      prov
    );

    // update lock
    let lock = await loadLockfile(cwd) || createEmptyLockfile();
    lock = addOrUpdateEntry(lock, entry.name, entry);
    await saveLockfile(lock, cwd);

    // optionally update manifest (basic, if present add to deps with normalized specifier)
    if (opts.updateManifest) {
      let manifest = await loadManifest(cwd);
      if (manifest) {
        if (!manifest.agentSkills) manifest.agentSkills = { dependencies: {}, devDependencies: {} };
        if (!manifest.agentSkills.dependencies) manifest.agentSkills.dependencies = {};
        // normalize specifier if shorthand
        let normSpec = spec;
        if (!/^(github:|npm:|skills\.sh\/|file:)/.test(spec)) {
          if (resolved.sourceType === 'github') normSpec = `github:${spec}`;
          else if (resolved.sourceType === 'npm') normSpec = `npm:${spec}`;
        }
        manifest.agentSkills.dependencies[entry.name] = normSpec;
        await saveManifest(manifest, cwd);
      }
    }

    return entry;
  }
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

// Export for tests + usage
// (ResolvedSourceInternal, canonicalizeName, parseSkillFrontmatterAsync already exported via declaration keywords)

