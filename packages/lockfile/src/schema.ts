import { z } from 'zod';
import type { SkillLockfile, LockfileEntry, Provenance } from '@skillctl/core';

export const ProvenanceSchema = z.object({
  type: z.enum(['github', 'npm', 'local', 'skills.sh', 'other']),
  commit: z.string().optional(),
  tarballHash: z.string().optional(),
  subpath: z.string().optional(),
});

export const LockfileEntrySchema = z.object({
  specifier: z.string(),
  resolved: z.string(),
  integrity: z.string().regex(/^sha256:[0-9a-f]{64}$/i, 'integrity must be sha256:<64hex>'),
  name: z.string().min(1),
  canonicalPath: z.string(),
  fetchedAt: z.string().datetime({ offset: true }).or(z.string()), // allow ISO
  provenance: ProvenanceSchema,
});

export const SkillLockfileSchema = z.object({
  lockfileVersion: z.literal('1.0'),
  agents: z.array(z.string()).optional(),
  skills: z.record(z.string(), LockfileEntrySchema),
});

export type { LockfileEntry, SkillLockfile, Provenance };

export function validateLockfile(input: unknown): SkillLockfile {
  return SkillLockfileSchema.parse(input) as SkillLockfile;
}
