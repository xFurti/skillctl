export interface ResolvedCodexAuth { apiKey: string; source: 'CODEX_API_KEY' | 'OPENAI_API_KEY' }

export function resolveCodexAuth(env: NodeJS.ProcessEnv = process.env): ResolvedCodexAuth {
  const codex = env.CODEX_API_KEY;
  const openai = env.OPENAI_API_KEY;
  if (codex && openai && codex !== openai) throw new Error('CODEX_API_KEY and OPENAI_API_KEY are both set with different values');
  if (codex) return { apiKey: codex, source: 'CODEX_API_KEY' };
  if (openai) return { apiKey: openai, source: 'OPENAI_API_KEY' };
  throw new Error('Codex authentication requires CODEX_API_KEY or OPENAI_API_KEY');
}
