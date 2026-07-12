import { homedir } from 'node:os';
import { join } from 'node:path';
import { createPathAdapter } from '../factory.js';

export const piAdapter = createPathAdapter({
  id: 'pi',
  name: 'Pi',
  projectPaths: ['.pi/skills'],
  globalPaths: [join(homedir(), '.pi', 'agent', 'skills')],
  detectDirs: ['.pi', join(homedir(), '.pi', 'agent')],
});
