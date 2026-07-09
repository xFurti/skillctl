import { cp, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  canonicalizeName,
  computeDirIntegrity,
  ensureDir,
  formatCanonicalPathForLock,
  importedSpecifier,
  lockToSkillTargets,
  type LockfileEntry,
  type Provenance,
} from '@skillctl/core';
import { loadLockfile, saveLockfile, createEmptyLockfile, addOrUpdateEntry, makeLockEntry } from '@skillctl/lockfile';
import { loadManifest, saveManifest } from '@skillctl/manifest';
import { RegistryManager } from '@skillctl/registry';
import { syncSkillsToAgents } from '@skillctl/adapters';
import { parseNpxSkillsLock, findNpxLock } from './parsers/npx-skills-lock.js';
import { scanSkillsDir } from './parsers/scan-skills-dir.js';
import { scanPythonSkillctlRepos } from './parsers/python-skillctl.js';
import { discoverProjectSkills } from './discover-project-skills.js';

export interface ImportOptions {
  cwd?: string;
  dryRun?: boolean;
  yes?: boolean;
  sync?: boolean;
  /** @deprecated Use sync */
  adopt?: boolean;
  writeManifest?: boolean;
  lockOnly?: boolean;
  source: 'npx' | 'python-skillctl' | 'project';
  sources?: string[];
}

export interface ImportPlanItem {
  name: string;
  action:
    | 'fetch'
    | 'copy-local'
    | 'register-existing'
    | 'skip-existing'
    | 'skip-broken'
    | 'skip-conflict';
  specifier?: string;
  localPath?: string;
  note?: string;
  adapter?: string;
  originalPath?: string;
}

export interface ImportResult {
  plan: ImportPlanItem[];
  discovered?: Awaited<ReturnType<typeof discoverProjectSkills>>;
  imported: string[];
  skipped: string[];
  errors: string[];
}

async function materializeLocal(
  localPath: string,
  name: string,
  prov: Provenance
): Promise<LockfileEntry> {
  const config = await import('@skillctl/core').then((m) => m.loadConfig());
  const store = config.store;
  const canonicalName = canonicalizeName(name);
  const target = join(store, canonicalName);
  await ensureDir(target);
  await cp(localPath, target, { recursive: true, force: true });
  const integrity = await computeDirIntegrity(target);
  const specifier = importedSpecifier(canonicalName);
  return makeLockEntry(
    canonicalName,
    specifier,
    specifier,
    integrity,
    formatCanonicalPathForLock(canonicalName),
    prov
  );
}

async function registerExistingCanonical(
  canonicalPath: string,
  name: string,
  prov: Provenance
): Promise<LockfileEntry> {
  const canonicalName = canonicalizeName(name);
  const integrity = await computeDirIntegrity(canonicalPath);
  const specifier = importedSpecifier(canonicalName);
  return makeLockEntry(
    canonicalName,
    specifier,
    specifier,
    integrity,
    formatCanonicalPathForLock(canonicalName),
    prov
  );
}

export async function planImportFromNpx(cwd: string): Promise<ImportPlanItem[]> {
  const plan: ImportPlanItem[] = [];
  const lockPath = await findNpxLock(cwd);
  const lock = (await loadLockfile(cwd)) || createEmptyLockfile();

  if (lockPath) {
    const entries = await parseNpxSkillsLock(lockPath);
    for (const e of entries) {
      const name = canonicalizeName(e.name);
      if (lock.skills[name]) {
        plan.push({ name, action: 'skip-existing', note: 'already in agent-skills.lock' });
        continue;
      }
      if (e.source) {
        plan.push({ name, action: 'fetch', specifier: normalizeNpxSource(e.source, e.ref) });
      } else {
        plan.push({ name, action: 'copy-local', localPath: join(cwd, '.agents', 'skills', name) });
      }
    }
  }

  const agentsDir = join(cwd, '.agents', 'skills');
  const dirSkills = await scanSkillsDir(agentsDir);
  for (const s of dirSkills) {
    const name = canonicalizeName(s.name);
    if (plan.some((p) => p.name === name)) continue;
    if (lock.skills[name]) {
      plan.push({ name, action: 'skip-existing' });
      continue;
    }
    plan.push({ name, action: 'copy-local', localPath: s.localPath });
  }

  return plan;
}

export async function planImportFromProject(
  cwd: string,
  opts?: { sources?: string[] }
): Promise<{ plan: ImportPlanItem[]; discovered: Awaited<ReturnType<typeof discoverProjectSkills>> }> {
  const lock = (await loadLockfile(cwd)) || createEmptyLockfile();
  const discovered = await discoverProjectSkills({ cwd, sources: opts?.sources });
  const plan: ImportPlanItem[] = [];

  for (const skill of discovered.deduped) {
    if (lock.skills[skill.name]) {
      plan.push({ name: skill.name, action: 'skip-existing', note: 'already in agent-skills.lock' });
      continue;
    }

    const primary = skill.occurrences[0];
    if (skill.action === 'skip-broken') {
      plan.push({
        name: skill.name,
        action: 'skip-broken',
        note: skill.note || `broken or missing SKILL.md at ${primary?.relativePath}`,
      });
      continue;
    }
    if (skill.action === 'skip-conflict') {
      plan.push({
        name: skill.name,
        action: 'skip-conflict',
        note: skill.note || 'conflicting skill contents found under the same canonical name',
      });
      continue;
    }

    if (skill.action === 'register-existing') {
      plan.push({
        name: skill.name,
        action: 'register-existing',
        localPath: skill.resolvedPath,
        specifier: importedSpecifier(skill.name),
        adapter: primary?.adapterId,
        originalPath: primary?.relativePath,
        note: skill.note,
      });
      continue;
    }

    plan.push({
      name: skill.name,
      action: 'copy-local',
      localPath: skill.resolvedPath,
      specifier: importedSpecifier(skill.name),
      adapter: primary?.adapterId,
      originalPath: primary?.relativePath,
      note: skill.note,
    });
  }

  return { plan, discovered };
}

function normalizeNpxSource(source: string, ref?: string): string {
  if (source.startsWith('file:')) return source;
  if (source.startsWith('github:') || source.startsWith('npm:')) {
    return ref ? `${source}@${ref}` : source;
  }
  if (source.includes('/') && !source.includes(':')) {
    return `github:${source}${ref ? `@${ref}` : ''}`;
  }
  return source;
}

function shouldWriteManifest(opts: ImportOptions): boolean {
  if (opts.lockOnly) return false;
  if (opts.writeManifest === false) return false;
  if (opts.source === 'project') return true;
  return !!opts.writeManifest;
}

function shouldSync(opts: ImportOptions): boolean {
  return !!(opts.sync || opts.adopt);
}

export async function executeImport(opts: ImportOptions): Promise<ImportResult> {
  const cwd = opts.cwd || process.cwd();
  const result: ImportResult = { plan: [], imported: [], skipped: [], errors: [] };

  if (opts.source === 'npx') {
    result.plan = await planImportFromNpx(cwd);
  } else if (opts.source === 'project') {
    const { plan, discovered } = await planImportFromProject(cwd, { sources: opts.sources });
    result.plan = plan;
    result.discovered = discovered;
  } else {
    const pyEntries = await scanPythonSkillctlRepos();
    const lock = (await loadLockfile(cwd)) || createEmptyLockfile();
    for (const e of pyEntries) {
      const name = canonicalizeName(e.name);
      if (lock.skills[name]) {
        result.plan.push({ name, action: 'skip-existing' });
      } else {
        result.plan.push({ name, action: 'copy-local', localPath: e.localPath });
      }
    }
  }

  if (opts.dryRun) return result;

  let lock = (await loadLockfile(cwd)) || createEmptyLockfile();

  for (const item of result.plan) {
    if (item.action === 'skip-existing') {
      result.skipped.push(item.name);
      continue;
    }
    if (item.action === 'skip-broken' || item.action === 'skip-conflict') {
      result.skipped.push(item.name);
      result.errors.push(`${item.name}: ${item.note || 'broken skill path'}`);
      continue;
    }

    try {
      let entry: LockfileEntry;
      const migratedFrom = opts.source === 'project' ? 'project-scan' : opts.source === 'npx' ? 'npx' : 'python-skillctl';
      const prov: Provenance = {
        type: 'local',
        migratedFrom,
        originalSource: item.originalPath || item.specifier || item.localPath,
        originalPath: item.originalPath,
        adapter: item.adapter,
      };

      if (item.action === 'fetch' && item.specifier) {
        entry = await new RegistryManager().add(item.specifier, { cwd, updateManifest: false });
        entry.provenance = { ...entry.provenance, ...prov };
      } else if (item.action === 'register-existing' && item.localPath) {
        try {
          await stat(item.localPath);
        } catch {
          result.errors.push(`${item.name}: canonical path not found ${item.localPath}`);
          continue;
        }
        entry = await registerExistingCanonical(item.localPath, item.name, prov);
      } else if (item.action === 'copy-local' && item.localPath) {
        try {
          await stat(item.localPath);
        } catch {
          result.errors.push(`${item.name}: local path not found ${item.localPath}`);
          continue;
        }
        entry = await materializeLocal(item.localPath, item.name, prov);
      } else {
        continue;
      }

      lock = addOrUpdateEntry(lock, entry.name, entry);
      result.imported.push(entry.name);
    } catch (e) {
      result.errors.push(`${item.name}: ${(e as Error).message}`);
    }
  }

  lock.metadata = { ...lock.metadata, migratedAt: new Date().toISOString(), toolVersion: '0.4.0' };
  await saveLockfile(lock, cwd);

  if (shouldWriteManifest(opts)) {
    let manifest = (await loadManifest(cwd)) || (await import('@skillctl/manifest')).createDefaultManifest();
    if (!manifest.agentSkills) manifest.agentSkills = { dependencies: {}, devDependencies: {} };
    if (!manifest.agentSkills.dependencies) manifest.agentSkills.dependencies = {};
    for (const name of result.imported) {
      const entry = lock.skills[name];
      if (entry) manifest.agentSkills.dependencies[name] = entry.specifier;
    }
    await saveManifest(manifest, cwd);
  }

  if (shouldSync(opts) && result.imported.length > 0) {
    const allTargets = await lockToSkillTargets(lock);
    const imported = new Set(result.imported);
    const skills = allTargets.filter((s) => imported.has(s.name));
    await syncSkillsToAgents(skills);
  }

  return result;
}
