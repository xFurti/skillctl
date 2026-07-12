import type { LockfileEntry, SkillLockfile, SkillManifest } from './types.js';

const PORTABLE_CANONICAL_PREFIXES = ['~/.skillctl/skills/', '.skillctl/skills/'];

export function isPortableCanonicalPath(path: string): boolean {
  return PORTABLE_CANONICAL_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function isPortableSpecifier(spec: string): boolean {
  if (/^(github:|skills\.sh\/|npm:)/.test(spec)) return true;
  if (spec.startsWith('local:imported/')) return true;
  if (spec.startsWith('file:./') || spec.startsWith('file:../')) return true;
  return false;
}

function checkEntry(name: string, field: string, value: string, warnings: string[]): void {
  if (field === 'canonicalPath') {
    if (!isPortableCanonicalPath(value)) {
      warnings.push(`${name}: lock ${field} is not portable (${value}) — run skillctl install to rewrite`);
    }
    return;
  }
  if (!isPortableSpecifier(value)) {
    warnings.push(`${name}: lock ${field} is not portable (${value}) — run skillctl install to rewrite`);
  }
}

/** Detect machine-local paths in manifest/lock that should be rewritten for git portability. */
export function findPortablePathWarnings(
  lock: SkillLockfile,
  manifest?: SkillManifest | null
): string[] {
  const warnings: string[] = [];

  for (const [name, entry] of Object.entries(lock.skills)) {
    checkEntry(name, 'specifier', entry.specifier, warnings);
    checkEntry(name, 'resolved', entry.resolved, warnings);
    checkEntry(name, 'canonicalPath', entry.canonicalPath, warnings);
  }

  const deps = {
    ...(manifest?.agentSkills?.dependencies || {}),
    ...(manifest?.agentSkills?.devDependencies || {}),
  };
  for (const [name, spec] of Object.entries(deps)) {
    if (!isPortableSpecifier(spec)) {
      warnings.push(`${name}: manifest specifier is not portable (${spec}) — run skillctl add/install to rewrite`);
    }
  }

  return warnings;
}

const FULL_COMMIT = /^[0-9a-f]{40}$/i;
const EXACT_NPM_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Detect legacy lock entries that cannot be restored deterministically on a new machine. */
export function findLockReproducibilityWarnings(lock: SkillLockfile): string[] {
  const warnings: string[] = [];
  for (const [name, entry] of Object.entries(lock.skills)) {
    if (entry.provenance.type === 'github' || entry.provenance.type === 'skills.sh') {
      const immutableResolved = /@[0-9a-f]{40}(?:#|\/|$)/i.test(entry.resolved);
      if (!FULL_COMMIT.test(entry.provenance.commit || '') || !immutableResolved) {
        warnings.push(`mutable-resolution: ${name} is not pinned to a full Git commit — run skillctl update ${name}`);
      }
    }
    if (entry.provenance.type === 'npm') {
      const version = entry.provenance.version || '';
      if (!EXACT_NPM_VERSION.test(version) || !entry.provenance.tarballHash) {
        warnings.push(`mutable-resolution: ${name} is missing an exact npm version or tarball integrity — run skillctl update ${name}`);
      }
    }
    if (entry.specifier.startsWith('local:imported/')) {
      warnings.push(`non-reproducible-local: ${name} requires its existing canonical imported copy`);
    }
  }
  return warnings;
}
