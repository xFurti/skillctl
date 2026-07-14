import semver from 'semver';
import type { SkillLockfile, SkillManifest, UpdateCandidate } from '@skillctl/core';
import { computeDirIntegrity, resolveEntryCanonicalPath } from '@skillctl/core';
import { RegistryManager } from './manager.js';

export async function planUpdates(
  lock: SkillLockfile,
  manifest: SkillManifest | null,
  options: { names?: string[]; latest?: boolean; store?: string; manager?: RegistryManager } = {},
): Promise<UpdateCandidate[]> {
  const manager = options.manager || new RegistryManager();
  const dependencies = {
    ...(manifest?.agentSkills?.devDependencies || {}),
    ...(manifest?.agentSkills?.dependencies || {}),
  };
  const selected = options.names?.length ? new Set(options.names) : null;
  const entries = Object.entries(lock.skills).filter(([name]) => !selected || selected.has(name));
  return Promise.all(entries.map(async ([name, entry]) => {
    const specifier = dependencies[name] || entry.specifier;
    const sourceType = entry.provenance.type;
    const base: UpdateCandidate = {
      name,
      sourceType,
      specifier,
      currentResolved: entry.resolved,
      status: 'current',
      kind: 'none',
    };
    if (specifier.startsWith('local:imported/') || (sourceType !== 'local' && !entry.provenance.commit && !entry.provenance.version)) {
      return { ...base, status: 'legacy', warning: `Run skillctl update ${name} to create an immutable resolution` };
    }
    if (sourceType === 'local') {
      try {
        const path = await resolveEntryCanonicalPath(entry, { store: options.store });
        const integrity = await computeDirIntegrity(path);
        return integrity === entry.integrity ? base : { ...base, status: 'modified', kind: 'content', candidateResolved: specifier };
      } catch (err) {
        return { ...base, status: 'unavailable', warning: (err as Error).message };
      }
    }
    if (sourceType === 'npm') {
      const currentVersion = entry.provenance.version || npmVersion(entry.resolved);
      const requested = npmRange(specifier);
      if (!options.latest && requested && semver.valid(requested)) return { ...base, currentVersion };
      try {
        const candidateSpec = options.latest ? npmLatestSpecifier(specifier) : specifier;
        const resolved = await manager.resolve(candidateSpec);
        const candidateVersion = resolved.ref;
        const changed = resolved.resolved !== entry.resolved;
        return {
          ...base,
          currentVersion,
          candidateVersion,
          candidateResolved: resolved.resolved,
          status: changed ? 'outdated' : 'current',
          kind: changed ? semverKind(currentVersion, candidateVersion) : 'none',
          manifestChange: options.latest && changed && candidateVersion
            ? { before: specifier, after: npmExactSpecifier(specifier, candidateVersion) }
            : undefined,
        };
      } catch (err) {
        return { ...base, currentVersion, status: 'unavailable', warning: (err as Error).message };
      }
    }
    if (sourceType === 'github' || sourceType === 'skills.sh') {
      try {
        const resolved = await manager.resolve(specifier);
        const changed = resolved.resolved !== entry.resolved;
        return {
          ...base,
          candidateResolved: resolved.resolved,
          status: changed ? 'outdated' : 'current',
          kind: changed ? 'commit' : 'none',
        };
      } catch (err) {
        return { ...base, status: 'unavailable', warning: (err as Error).message };
      }
    }
    return { ...base, status: 'unsupported', warning: `No update planner for ${sourceType}` };
  }));
}

function npmVersion(resolved: string): string | undefined {
  return /@([^@]+)$/.exec(resolved)?.[1];
}

function npmRange(specifier: string): string | undefined {
  const raw = specifier.replace(/^npm:/, '');
  const index = raw.lastIndexOf('@');
  return index > 0 ? raw.slice(index + 1) : undefined;
}

function npmPackage(specifier: string): string {
  const raw = specifier.replace(/^npm:/, '');
  const index = raw.lastIndexOf('@');
  return index > 0 ? raw.slice(0, index) : raw;
}

function npmLatestSpecifier(specifier: string): string {
  return `npm:${npmPackage(specifier)}@latest`;
}

function npmExactSpecifier(specifier: string, version: string): string {
  return `npm:${npmPackage(specifier)}@${version}`;
}

function semverKind(current?: string, candidate?: string): UpdateCandidate['kind'] {
  if (!current || !candidate) return 'content';
  const difference = semver.diff(current, candidate);
  if (difference?.includes('major')) return 'major';
  if (difference?.includes('minor')) return 'minor';
  if (difference?.includes('patch')) return 'patch';
  return 'content';
}
