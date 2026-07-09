#!/usr/bin/env node
import { prepareProgram } from '../dist/index.js';

const program = await prepareProgram();

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}
await program.parseAsync(process.argv);
