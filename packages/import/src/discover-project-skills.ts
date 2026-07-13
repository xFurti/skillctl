import { join, relative } from 'node:path';
import { canonicalizeName, computeDirIntegrity, getProjectSkillsStore, getRegisteredAdapters } from '@skillctl/core';
import { pathExists } from '@skillctl/adapters';
import '@skillctl/adapters';
import { scanSkillsDir } from './parsers/scan-skills-dir.js';
import { classifySkillPath, type SkillLinkKind } from './parsers/link-classifier.js';

export interface DiscoveredSkillOccurrence {
  adapterId: string;
  adapterName: string;
  projectPath: string;
  relativePath: string;
  localPath: string;
  kind: SkillLinkKind;
  resolvedPath: string;
}

export interface DiscoveredSource {
  adapterId: string;
  adapterName: string;
  projectPath: string;
  absolutePath: string;
  skills: DiscoveredSkillOccurrence[];
}

export type ProjectImportAction =
  | 'copy-local'
  | 'register-existing'
  | 'skip-existing'
  | 'skip-broken'
  | 'skip-conflict';

export interface DedupedProjectSkill {
  name: string;
  kind: SkillLinkKind;
  resolvedPath: string;
  action: ProjectImportAction;
  occurrences: DiscoveredSkillOccurrence[];
  note?: string;
}

export interface DiscoverProjectSkillsOptions {
  cwd?: string;
  sources?: string[];
}

function actionForKind(kind: SkillLinkKind): ProjectImportAction {
  if (kind === 'skillctl-link') return 'register-existing';
  if (kind === 'broken') return 'skip-broken';
  return 'copy-local';
}

function pickPrimaryOccurrence(occurrences: DiscoveredSkillOccurrence[]): DiscoveredSkillOccurrence {
  const linked = occurrences.find((o) => o.kind === 'skillctl-link');
  if (linked) return linked;
  return occurrences[0];
}

export async function discoverProjectSkills(
  opts: DiscoverProjectSkillsOptions = {}
): Promise<{ sources: DiscoveredSource[]; deduped: DedupedProjectSkill[] }> {
  const cwd = opts.cwd || process.cwd();
  const storeRoot = getProjectSkillsStore(cwd);
  const filter = opts.sources?.map((s) => s.toLowerCase());

  const sources: DiscoveredSource[] = [];
  const byName = new Map<string, DiscoveredSkillOccurrence[]>();

  for (const adapter of getRegisteredAdapters()) {
    if (filter?.length && !filter.includes(adapter.id.toLowerCase())) continue;

    for (const projectPath of adapter.projectPaths) {
      const absolutePath = join(cwd, projectPath);
      if (!(await pathExists(absolutePath))) continue;

      const dirSkills = await scanSkillsDir(absolutePath);
      const skills: DiscoveredSkillOccurrence[] = [];

      for (const s of dirSkills) {
        const classified = await classifySkillPath(s.localPath, storeRoot);
        const relativePath = relative(cwd, s.localPath).replace(/\\/g, '/');
        const occurrence: DiscoveredSkillOccurrence = {
          adapterId: adapter.id,
          adapterName: adapter.name,
          projectPath,
          relativePath,
          localPath: s.localPath,
          kind: classified.kind,
          resolvedPath: classified.resolvedPath,
        };
        skills.push(occurrence);

        const key = canonicalizeName(s.name);
        const list = byName.get(key) || [];
        list.push(occurrence);
        byName.set(key, list);
      }

      if (skills.length > 0) {
        sources.push({
          adapterId: adapter.id,
          adapterName: adapter.name,
          projectPath,
          absolutePath,
          skills,
        });
      }
    }
  }

  const deduped: DedupedProjectSkill[] = [];
  for (const [name, occurrences] of byName.entries()) {
    const primary = pickPrimaryOccurrence(occurrences);
    const kind = primary.kind;
    const distinctPaths = [...new Set(occurrences.map((o) => o.resolvedPath.toLowerCase()))];
    if (distinctPaths.length > 1) {
      const integrities = new Set<string>();
      for (const occurrence of occurrences) {
        integrities.add(
          await computeDirIntegrity(occurrence.resolvedPath).catch(() => `unreadable:${occurrence.resolvedPath}`)
        );
      }
      if (integrities.size > 1) {
        deduped.push({
          name,
          kind,
          resolvedPath: primary.resolvedPath,
          action: 'skip-conflict',
          occurrences,
          note: `conflicting skill contents found in ${occurrences.map((o) => o.relativePath).join(', ')}`,
        });
        continue;
      }
    }
    deduped.push({
      name,
      kind,
      resolvedPath: primary.resolvedPath,
      action: actionForKind(kind),
      occurrences,
      note:
        occurrences.length > 1
          ? `found in ${occurrences.map((o) => o.relativePath).join(', ')}`
          : undefined,
    });
  }

  deduped.sort((a, b) => a.name.localeCompare(b.name));
  return { sources, deduped };
}
