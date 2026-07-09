import { isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { AgentAdapter } from '@skillctl/core';
import { BaseAgentAdapter, basicDetect } from './base/index.js';
import { pathExists } from '@skillctl/link-manager';

export interface PathAdapterConfig {
  id: string;
  name: string;
  projectPaths: string[];
  globalPaths: string[];
  detectDirs?: string[];
}

export function createPathAdapter(config: PathAdapterConfig): AgentAdapter {
  class PathAdapter extends BaseAgentAdapter implements AgentAdapter {
    constructor() {
      super(config.id, config.name, config.projectPaths, config.globalPaths);
    }

    async detect(): Promise<boolean> {
      if (config.detectDirs?.length) {
        const cwd = process.cwd();
        for (const d of config.detectDirs) {
          const p = d.startsWith('~')
            ? join(homedir(), d.slice(2))
            : isAbsolute(d)
              ? d
              : resolve(cwd, d);
          if (await pathExists(p)) return true;
        }
      }
      return basicDetect(this.projectPaths, this.globalPaths);
    }
  }
  return new PathAdapter();
}
