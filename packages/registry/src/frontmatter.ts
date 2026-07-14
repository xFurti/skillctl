import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { load } from 'js-yaml';

export async function parseSkillFrontmatterAsync(skillDir: string): Promise<{ name?: string; description?: string }> {
  const candidates = ['SKILL.md', 'skill.md'];
  for (const f of candidates) {
    const p = join(skillDir, f);
    try {
      const content = await readFile(p, 'utf8');
      const match = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
      if (match?.[1]) {
        const parsed = load(match[1]);
        if (parsed && typeof parsed === 'object') {
          const fields = parsed as Record<string, unknown>;
          if (typeof fields.name === 'string') {
            return {
              name: fields.name.trim(),
              description: typeof fields.description === 'string' ? fields.description.trim() : undefined,
            };
          }
        }
      }
      const looseName = content.match(/name:\s*["']?([^"'\n]+)/i);
      if (looseName) return { name: looseName[1].trim() };
    } catch {
      // continue
    }
  }
  return { name: basename(skillDir) };
}
