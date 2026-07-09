/**
 * Core types for skillctl.
 * Defines shared interfaces used across manifest, lockfile, registry, etc.
 * Follows patterns from design doc (PR2).
 */

// Basic skill reference (specifier from manifest)
export interface SkillRef {
  name: string; // canonical lowercase-hyphen name (from SKILL.md frontmatter or dir)
  version?: string; // optional semver or git ref
  source: string; // original specifier e.g. "github:...", "npm:...", "file:...", "skills.sh/..."
}

// Resolved skill after fetching/materializing to canonical store
export interface ResolvedSkill {
  name: string;
  canonicalPath: string; // e.g. ~/.skillctl/skills/<name>
  integrity: string; // 'sha256:<hex>'
  resolvedSource: string;
  fetchedAt: string; // ISO timestamp
  // provenance fields mixed sources
  provenance?: Provenance;
}

export interface Provenance {
  type: 'github' | 'npm' | 'local' | 'skills.sh' | 'other';
  commit?: string; // for git/github
  tarballHash?: string; // for npm etc
  subpath?: string; // e.g. 'skills/foo' inside repo/pkg
  migratedFrom?: 'npx' | 'python-skillctl' | 'project-scan';
  originalHash?: string;
  originalSource?: string;
  originalPath?: string;
  adapter?: string;
  signature?: string;
}

// Agent adapter interface (used by link/sync, stubbed for now)
export interface AgentAdapter {
  readonly id: string; // 'claude-code'
  readonly name: string;
  readonly projectPaths: string[]; // relative e.g. ['.claude/skills']
  readonly globalPaths: string[];
  detect(): Promise<boolean>;
  ensureTarget(
    skillName: string,
    targetPath: string,
    canonical: string,
    mode?: 'symlink' | 'copy' | 'junction',
    options?: { relative?: boolean; dryRun?: boolean; force?: boolean }
  ): Promise<void>;
  removeTarget(skillName: string, targetPath: string, canonical?: string): Promise<void>;
}

// Registry source (for resolution in later PRs)
export interface RegistrySource {
  readonly id: string;
  match(spec: string): boolean;
  resolve(spec: string, options?: { ref?: string; cwd?: string }): Promise<ResolvedSource>;
  fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }>;
}

export interface ResolvedSource {
  name: string;
  resolved: string; // canonical resolved form e.g. github:owner/repo@sha/sub
  sourceType: 'github' | 'npm' | 'local' | 'skills.sh';
  sourceId: string;
  originalSpec: string;
  tarballUrl?: string;
  tarballHash?: string;
  gitUrl?: string;
  ref?: string;
  subpath?: string;
  localPath?: string;
}

// Skill manifest (project level agent-skills.json)
export interface SkillManifest {
  name?: string;
  version?: string;
  agentSkills?: {
    dependencies?: Record<string, string>; // name -> specifier
    devDependencies?: Record<string, string>;
  };
}

// Lockfile entry (detailed for mixed sources)
export interface LockfileEntry {
  specifier: string;
  resolved: string;
  integrity: string; // sha256:...
  name: string;
  canonicalPath: string;
  fetchedAt: string;
  provenance: Provenance;
}

export interface SkillLockfile {
  lockfileVersion: '1.0';
  agents?: string[];
  skills: Record<string, LockfileEntry>;
  metadata?: {
    migratedAt?: string;
    toolVersion?: string;
  };
}

// Config for ~/.skillctl/config.json
export interface SkillctlConfig {
  version: 1;
  store: string; // path to canonical, defaults to ~/.skillctl/skills
  defaultMode: 'symlink' | 'copy' | 'junction';
  agents: Record<string, boolean>; // enabled agents e.g. { 'claude-code': true }
  registries?: string[];
  trustedSources?: string[];
  experimental?: {
    plugins?: boolean;
  };
  plugins?: Array<{ name: string; path: string; enabled: boolean }>;
}

export type LinkMode = 'symlink' | 'copy' | 'junction';

// Collision policy note: within a scope (project/global), names are unique.
// Project manifest takes precedence over global for resolution in project context.
// On add conflict: warn, use first-seen or scoped name; record in lock.
