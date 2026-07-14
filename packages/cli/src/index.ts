import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RegistryManager } from '@skillctl/registry';
import { loadPlugins } from '@skillctl/plugin-system';
import '@skillctl/adapters';

import { registerInit } from './commands/init.js';
import { registerAdd } from './commands/add.js';
import { registerInstall } from './commands/install.js';
import { registerSync } from './commands/sync.js';
import { registerRemove } from './commands/remove.js';
import { registerList } from './commands/list.js';
import { registerDoctor } from './commands/doctor.js';
import { registerImport } from './commands/import-cmd.js';
import { registerAudit } from './commands/audit.js';
import { registerUpdate } from './commands/update.js';
import { registerPlugin } from './commands/plugin.js';
import { registerSkill } from './commands/skill.js';
import { registerSearch } from './commands/search.js';
import { registerInfo } from './commands/info.js';
import { registerOutdated } from './commands/outdated.js';
import { registerCompletion } from './commands/completion.js';
import { CatalogManager } from '@skillctl/registry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkgPath = join(__dirname, '..', 'package.json');
let version = '0.7.3';
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  version = pkg.version || version;
} catch {
  // fallback
}

const program = new Command();
const registryManager = new RegistryManager();
const catalogManager = new CatalogManager();

program
  .name('skillctl')
  .description('Universal package-manager-like CLI for Agent Skills')
  .version(version, '-v, --version', 'output the current version')
  .helpOption('-h, --help', 'display help for command');

registerInit(program);
registerList(program);
registerDoctor(program);
registerAdd(program, registryManager);
registerInstall(program, registryManager);
registerSync(program);
registerRemove(program);
registerImport(program);
registerAudit(program);
registerUpdate(program, registryManager);
registerPlugin(program);
registerSkill(program);
registerSearch(program, catalogManager, registryManager);
registerInfo(program, registryManager);
registerOutdated(program);
registerCompletion(program);

export async function prepareProgram(): Promise<Command> {
  await loadPlugins(program as import('@skillctl/plugin-system').PluginProgram, registryManager, catalogManager);
  return program;
}

export { program };
