import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RegistryManager } from '@leogriel/registry';
import { loadPlugins } from '@leogriel/plugin-system';
import '@leogriel/adapters';

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
import { registerBackup } from './commands/backup.js';
import { registerTest } from './commands/test.js';
import { CatalogManager } from '@leogriel/registry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkgPath = join(__dirname, '..', 'package.json');
let version = '1.0.0-beta.2';
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
  .name('leogriel')
  .description('Weave Agent Skills into every workflow')
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
registerBackup(program);
registerTest(program, version);

export async function prepareProgram(): Promise<Command> {
  await loadPlugins(program as import('@leogriel/plugin-system').PluginProgram, registryManager, catalogManager);
  return program;
}

export { program };
