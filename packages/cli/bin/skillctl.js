#!/usr/bin/env node
import { program } from '../dist/index.js';

// Skeleton: bare invocation shows help (no subcommands registered yet).
// parse() only for actual args.
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}
program.parse(process.argv);
