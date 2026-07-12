import { rm, cp, stat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Provenance, LockfileEntry, ResolvedSource } from '@skillctl/core';
import {
  loadConfig,
  ensureDir,
  computeDirIntegrity,
  getCachedSkill,
  putCachedSkill,
  ensureCacheDir,
  canonicalizeName,
  formatCanonicalPathForLock,
  portableSpecifierForResolved,
  getGlobalSkillctlRoot,
  getGlobalSkillsStore,
  getProjectSkillsStore,
  requireSkillctlProject,
} from '@skillctl/core';
import { createEmptyLockfile, addOrUpdateEntry, makeLockEntry } from '@skillctl/lockfile';
import { updateProjectState, withOperationLocks } from '@skillctl/project-state';

import { limitedFetch } from './fetch/concurrency.js';
import { LocalSource } from './sources/local.js';
import { GitHubSource } from './sources/github.js';
import { NpmSource } from './sources/npm.js';
import { SkillsShSource } from './sources/skills-sh.js';
import type { RegistrySource } from '@skillctl/core';
import { defaultHttpClient, type HttpClient } from './fetch/https.js';

export class RegistryManager {
  private sources: RegistrySource[] = [];

  constructor(options: { httpClient?: HttpClient } = {}) {
    const httpClient = options.httpClient || defaultHttpClient;
    this.register(new NpmSource(httpClient));
    this.register(new SkillsShSource(httpClient));
    this.register(new GitHubSource(httpClient));
    this.register(new LocalSource());
  }

  register(source: RegistrySource): void {
    this.sources.push(source);
  }

  getSources(): RegistrySource[] {
    return [...this.sources];
  }

  async resolve(spec: string, options?: { ref?: string; cwd?: string }): Promise<ResolvedSource> {
    for (const src of this.sources) {
      if (src.match(spec)) {
        const res = await src.resolve(spec, options);
        return { ...res, originalSpec: spec };
      }
    }
    if (spec.includes('/') && !spec.includes(':')) {
      const gh = this.sources.find((source) => source.id === 'github');
      if (gh?.match(spec)) {
        const res = await gh.resolve(spec, options);
        return { ...res, originalSpec: spec };
      }
    }
    throw new Error(`No registry source matched spec: ${spec}. Supported: github:, npm:, skills.sh/, file:, ./local`);
  }

  async materialize(
    resolved: ResolvedSource,
    options?: { name?: string; expectedIntegrity?: string; store?: string }
  ): Promise<{ canonicalPath: string; integrity: string; sourceType: string }> {
    const config = await loadConfig();
    const store = options?.store || config.store;
    await ensureDir(store);

    const canonicalName = canonicalizeName(options?.name || resolved.name);
    const target = join(store, canonicalName);
    const tmpDest = join(tmpdir(), `skillctl-mat-${canonicalName}-${randomUUID()}`);
    await ensureDir(tmpDest);

    try {
      const source = this.sources.find((s) => s.id === resolved.sourceId);
      if (!source) throw new Error(`no source for materialize: ${resolved.sourceId}`);
      await limitedFetch(() => source.fetch(resolved, tmpDest));
    } catch (err) {
      await rm(tmpDest, { recursive: true, force: true }).catch(() => {});
      throw err;
    }

    let treeIntegrity: string;
    try {
      await assertTreeContained(tmpDest);
      treeIntegrity = await computeDirIntegrity(tmpDest);
      if (options?.expectedIntegrity && treeIntegrity !== options.expectedIntegrity) {
        throw new Error(
          `Locked integrity mismatch for ${canonicalName}: expected ${options.expectedIntegrity}, got ${treeIntegrity}`
        );
      }
    } catch (err) {
      await rm(tmpDest, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
    await ensureCacheDir().catch(() => {});
    let cached = await getCachedSkill(treeIntegrity);
    if (cached) {
      const cachedIntegrity = await computeDirIntegrity(cached).catch(() => 'invalid');
      if (cachedIntegrity !== treeIntegrity) {
        await rm(cached, { recursive: true, force: true }).catch(() => {});
        cached = null;
      }
    }
    let sourceForTarget = tmpDest;

    if (cached) {
      sourceForTarget = cached;
      await rm(tmpDest, { recursive: true, force: true }).catch(() => {});
    } else {
      await putCachedSkill(treeIntegrity, tmpDest).catch(() => {});
    }

    const staging = join(store, `.${canonicalName}.tmp-${randomUUID()}`);
    const backup = join(store, `.${canonicalName}.backup-${randomUUID()}`);
    let movedExisting = false;
    try {
      await cp(sourceForTarget, staging, { recursive: true, force: true });
      const { rename } = await import('node:fs/promises');
      if (await exists(target)) {
        await rename(target, backup);
        movedExisting = true;
      }
      await rename(staging, target);
      if (movedExisting) await rm(backup, { recursive: true, force: true }).catch(() => {});
    } catch (err) {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      if (movedExisting && !(await exists(target))) {
        const { rename } = await import('node:fs/promises');
        await rename(backup, target).catch(() => {});
      }
      throw err;
    } finally {
      await rm(tmpDest, { recursive: true, force: true }).catch(() => {});
    }

    return { canonicalPath: target, integrity: treeIntegrity, sourceType: resolved.sourceType };
  }

  async add(
    spec: string,
    opts: { cwd?: string; updateManifest?: boolean; name?: string; global?: boolean } = {}
  ): Promise<LockfileEntry> {
    const requestedCwd = opts.cwd || process.cwd();
    const cwd = opts.global ? getGlobalSkillctlRoot() : await requireSkillctlProject(requestedCwd);
    const store = opts.global ? getGlobalSkillsStore() : getProjectSkillsStore(cwd);
    return withOperationLocks({ cwd, store }, () => this.addUnlocked(spec, { ...opts, cwd, store }));
  }

  private async addUnlocked(
    spec: string,
    opts: { cwd: string; store: string; updateManifest?: boolean; name?: string; global?: boolean }
  ): Promise<LockfileEntry> {
    const cwd = opts.cwd;
    const resolved = await this.resolve(spec, { cwd });
    const mat = await this.materialize(resolved, { name: opts.name, store: opts.store });

    const prov: Provenance = {
      type: resolved.sourceType === 'skills.sh' ? 'skills.sh' : resolved.sourceType,
      subpath: resolved.subpath,
    };
    if (resolved.sourceType === 'github' || resolved.sourceType === 'skills.sh') {
      prov.commit = resolved.ref;
      prov.requestedRef = resolved.requestedRef;
    }
    if (resolved.sourceType === 'npm') {
      prov.tarballHash = resolved.tarballHash;
      prov.tarballUrl = resolved.tarballUrl;
      prov.version = resolved.ref;
      prov.requestedRef = resolved.requestedRef;
    }

    const skillName = canonicalizeName(opts.name || resolved.name);
    const portableSpec = portableSpecifierForResolved(spec, resolved, cwd);
    const lockResolved = resolved.sourceType === 'local' ? portableSpec : resolved.resolved;

    const entry = makeLockEntry(
      skillName,
      portableSpec,
      lockResolved,
      mat.integrity,
      formatCanonicalPathForLock(skillName, opts.global ? 'global' : 'project'),
      prov
    );

    await updateProjectState(cwd, async (state) => {
      const lock = addOrUpdateEntry(state.lockfile || createEmptyLockfile(), entry.name, entry);
      const manifest = state.manifest;
      if (opts.updateManifest && manifest) {
        if (!manifest.agentSkills) manifest.agentSkills = { dependencies: {}, devDependencies: {} };
        if (!manifest.agentSkills.dependencies) manifest.agentSkills.dependencies = {};
        manifest.agentSkills.dependencies[entry.name] = portableSpec;
      }
      return { state: { manifest, lockfile: lock }, result: undefined };
    });

    return entry;
  }

  async installLockedEntry(
    entry: LockfileEntry,
    options: { cwd?: string; expectedIntegrity?: string; name?: string; store?: string } = {}
  ): Promise<{ canonicalPath: string; integrity: string; sourceType: string }> {
    const cwd = options.cwd || process.cwd();
    const config = await loadConfig();
    const store = options.store || config.store;
    return withOperationLocks({ cwd, store }, () => this.installLockedEntryUnlocked(entry, { ...options, cwd, store }));
  }

  private async installLockedEntryUnlocked(
    entry: LockfileEntry,
    options: { cwd: string; store: string; expectedIntegrity?: string; name?: string }
  ): Promise<{ canonicalPath: string; integrity: string; sourceType: string }> {
    const cwd = options.cwd;
    const resolved = await this.resolveLockedEntry(entry, cwd);
    return this.materialize(resolved, {
      name: options.name || entry.name,
      expectedIntegrity: options.expectedIntegrity || entry.integrity,
      store: options.store,
    });
  }

  private async resolveLockedEntry(entry: LockfileEntry, cwd: string): Promise<ResolvedSource> {
    if (entry.provenance.type === 'npm') {
      const match = /^npm:(.+)@([^@]+)$/.exec(entry.resolved);
      if (!match) throw new Error(`Invalid locked npm resolution: ${entry.resolved}`);
      if (!entry.provenance.tarballUrl || !entry.provenance.tarballHash) {
        throw new Error(`Legacy npm lock entry requires update before frozen install: ${entry.name}`);
      }
      return {
        name: entry.name,
        resolved: entry.resolved,
        sourceType: 'npm',
        sourceId: 'npm',
        originalSpec: entry.specifier,
        ref: entry.provenance.version || match[2],
        requestedRef: entry.provenance.requestedRef,
        tarballUrl: entry.provenance.tarballUrl,
        tarballHash: entry.provenance.tarballHash,
      };
    }
    return this.resolve(entry.resolved, { cwd });
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function assertTreeContained(root: string, dir = root): Promise<void> {
  const rootAbs = resolve(root);
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await realpath(path);
      const rel = relative(rootAbs, target);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(`Refusing skill with a symlink escaping its root: ${path}`);
      }
    } else if (entry.isDirectory()) {
      await assertTreeContained(rootAbs, path);
    }
  }
}
