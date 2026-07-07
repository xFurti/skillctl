/**
 * Grok Adapter.
 * Paths:
 *   global: ~/.grok/skills
 *   project: .grok/skills
 */
import { BaseAgentAdapter, join, homedir, basicDetect } from '../base/index.js';
import type { AgentAdapter } from '@skillctl/core';
import { pathExists } from '@skillctl/link-manager';

export class GrokAdapter extends BaseAgentAdapter implements AgentAdapter {
  constructor() {
    super('grok', 'Grok', ['.grok/skills'], [join(homedir(), '.grok', 'skills')]);
  }

  async detect(): Promise<boolean> {
    const cwd = process.cwd();
    const project = join(cwd, '.grok');
    const global = join(homedir(), '.grok');
    if ((await pathExists(project)) || (await pathExists(global))) {
      return true;
    }
    return basicDetect(this.projectPaths, this.globalPaths);
  }
}

export const grokAdapter = new GrokAdapter();