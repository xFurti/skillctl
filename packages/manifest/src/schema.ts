import { z } from 'zod';
import type { SkillManifest } from '@skillctl/core';

// Specifier grammar (MVP): (github:|skills.sh/|npm:|file:)[^ ]+ (optional @ref or ^semver range)
const SpecifierSchema = z.string().regex(
  /^(github:|skills\.sh\/|npm:|file:).+/,
  'Invalid specifier. Must start with github:, skills.sh/, npm:, or file:'
);

export const AgentSkillsManifestSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  agentSkills: z
    .object({
      dependencies: z.record(z.string(), SpecifierSchema).default({}),
      devDependencies: z.record(z.string(), SpecifierSchema).default({}),
    })
    .optional()
    .default({ dependencies: {}, devDependencies: {} }),
});

export type AgentSkillsManifest = z.infer<typeof AgentSkillsManifestSchema>;

// Validate + normalize manifest
export function validateManifest(input: unknown): AgentSkillsManifest {
  const parsed = AgentSkillsManifestSchema.parse(input);
  // Basic name collision policy within manifest: no duplicate keys across dep types
  const deps = parsed.agentSkills?.dependencies || {};
  const devDeps = parsed.agentSkills?.devDependencies || {};
  const allNames = [...Object.keys(deps), ...Object.keys(devDeps)];
  const unique = new Set(allNames);
  if (unique.size !== allNames.length) {
    const dups = allNames.filter((n, i) => allNames.indexOf(n) !== i);
    throw new Error(`Manifest collision: duplicate skill names in dependencies and devDependencies: ${[...new Set(dups)].join(', ')}`);
  }
  return parsed;
}

export function toSkillManifest(m: AgentSkillsManifest): SkillManifest {
  return {
    name: m.name,
    version: m.version,
    agentSkills: m.agentSkills,
  };
}
