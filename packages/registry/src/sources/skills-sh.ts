import type { RegistrySource, ResolvedSource } from '@skillctl/core';
import { GitHubSource } from './github.js';
import { defaultHttpClient, type HttpClient } from '../fetch/https.js';
import { canonicalizeName } from '../names.js';

export class SkillsShSource implements RegistrySource {
  readonly id = 'skills.sh';

  constructor(private readonly httpClient: HttpClient = defaultHttpClient) {}

  match(spec: string): boolean {
    return spec.startsWith('skills.sh/') || spec.startsWith('npx-skills/');
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    const inner = spec.replace(/^skills\.sh\//, '').replace(/^npx-skills\//, '');

    if (!inner.includes('/')) {
      throw new Error(
        `skills.sh name-only spec "${inner}" requires owner/repo form (e.g. skills.sh/vercel-labs/agent-skills). ` +
          `Use github:owner/repo or add via npx skills import.`
      );
    }

    const hashIndex = inner.indexOf('#');
    const repositoryPart = hashIndex >= 0 ? inner.slice(0, hashIndex) : inner;
    const fragment = hashIndex >= 0 ? inner.slice(hashIndex + 1) : undefined;
    const segments = repositoryPart.split('/').filter(Boolean);
    const repository = segments.slice(0, 2).join('/');
    const pathSelector = segments.slice(2).join('/') || undefined;
    const skillSelector = fragment?.startsWith('skill=')
      ? decodeURIComponent(fragment.slice('skill='.length))
      : pathSelector;
    const subpath = fragment && !fragment.startsWith('skill=') ? fragment : undefined;
    const gh = new GitHubSource(this.httpClient);
    const resolvedGh = await gh.resolve(`github:${repository}${subpath ? `#${subpath}` : ''}`, options);
    return {
      ...resolvedGh,
      name: skillSelector ? canonicalizeName(skillSelector) : resolvedGh.name,
      sourceType: 'skills.sh',
      sourceId: this.id,
      originalSpec: spec,
      skillSelector,
      resolved: `${resolvedGh.resolved.replace('github:', 'skills.sh/')}${skillSelector ? `#skill=${encodeURIComponent(skillSelector)}` : ''}`,
    };
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    return new GitHubSource(this.httpClient).fetch(resolved, dest);
  }
}
