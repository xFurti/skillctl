import { basename } from 'node:path';
import { parseSkillDirectory } from '@skillctl/core';

export async function parseSkillFrontmatterAsync(skillDir: string): Promise<{ name?: string; description?: string }> {
  try {
    const parsed = await parseSkillDirectory(skillDir, { validation: 'collect' });
    return {
      name: typeof parsed.frontmatter.name === 'string' ? parsed.frontmatter.name : parsed.name,
      description: parsed.description || undefined,
    };
  } catch {
    return { name: basename(skillDir) };
  }
}
