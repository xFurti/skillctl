import type { Command } from 'commander';
import { redactSecrets } from '@leogriel/core';

export interface CliIssue {
  code: string;
  message: string;
  details?: unknown;
}

export interface CliEnvelope<T> {
  schemaVersion: 1;
  ok: boolean;
  command: string;
  data: T | null;
  warnings: CliIssue[];
  errors: CliIssue[];
}

interface OutputState {
  json: boolean;
  command: string;
  messages: string[];
  warnings: CliIssue[];
  errors: CliIssue[];
}

let state: OutputState = freshState(false);

export function cliLog(...args: unknown[]): void {
  const message = redactText(formatArgs(args));
  if (state.json) state.messages.push(message);
  else process.stdout.write(`${message}\n`);
}

export function cliWarn(...args: unknown[]): void {
  const message = redactText(formatArgs(args));
  state.warnings.push({ code: 'COMMAND_WARNING', message });
  process.stderr.write(`${message}\n`);
}

export function cliError(...args: unknown[]): void {
  const message = redactText(formatArgs(args));
  state.errors.push({ code: 'COMMAND_ERROR', message });
  process.stderr.write(`${message}\n`);
}

export function addCliIssue(kind: 'warning' | 'error', issue: CliIssue): void {
  const redacted = redactSecrets(issue, knownSecrets()).value;
  state[kind === 'warning' ? 'warnings' : 'errors'].push(redacted);
  process.stderr.write(`${redacted.message}\n`);
}

export function writeCliRaw(stream: 'stdout' | 'stderr', value: string): void {
  process[stream].write(redactText(value));
}

export async function runCli(program: Command, argv = process.argv): Promise<void> {
  state = freshState(argv.includes('--json'));
  if (!state.json) {
    configureHumanCommands(program);
    await program.parseAsync(argv);
    return;
  }

  configureJsonCommands(program);
  try {
    await program.parseAsync(argv);
  } catch (err) {
    addCliIssue('error', {
      code: 'COMMAND_ERROR',
      message: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = process.exitCode || 2;
  }

  const data = parseSingleStructuredMessage(state.messages)
    ?? (state.messages.length ? { messages: state.messages } : null);
  const exitCode = numericExitCode();
  const envelope: CliEnvelope<unknown> = {
    schemaVersion: 1,
    ok: state.errors.length === 0 && exitCode < 2,
    command: state.command,
    data,
    warnings: state.warnings,
    errors: state.errors,
  };
  const redacted = redactSecrets(envelope, knownSecrets());
  process.stdout.write(`${JSON.stringify(redacted.value, null, 2)}\n`);
}

function configureHumanCommands(program: Command): void {
  program.configureOutput({
    writeOut: (value) => writeCliRaw('stdout', value),
    writeErr: (value) => writeCliRaw('stderr', value),
    outputError: (value, write) => write(redactText(value)),
  });
}

function freshState(json: boolean): OutputState {
  return { json, command: 'help', messages: [], warnings: [], errors: [] };
}

function numericExitCode(): number {
  if (typeof process.exitCode === 'number') return process.exitCode;
  if (typeof process.exitCode === 'string') return Number.parseInt(process.exitCode, 10) || 0;
  return 0;
}

function formatArgs(args: unknown[]): string {
  return args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
}

function parseSingleStructuredMessage(messages: string[]): unknown | undefined {
  if (messages.length !== 1) return undefined;
  try {
    return JSON.parse(messages[0]);
  } catch {
    return undefined;
  }
}

function configureJsonCommands(program: Command): void {
  const visit = (command: Command): void => {
    command.exitOverride();
    command.hook('preSubcommand', (_thisCommand, subcommand) => { state.command = commandPath(subcommand); });
    for (const child of command.commands) visit(child);
  };
  visit(program);
  program.configureOutput({
    writeOut: (value) => state.messages.push(redactText(value.trimEnd())),
    writeErr: () => {},
    outputError: (_value, write) => write(''),
  });
  program.hook('preAction', (_thisCommand, actionCommand) => { state.command = commandPath(actionCommand); });
}

function commandPath(command: Command): string {
  const names: string[] = [];
  for (let current: Command | null = command; current?.parent; current = current.parent) names.unshift(current.name());
  return names.join(' ') || 'help';
}

function knownSecrets(): Record<string, string | undefined> {
  return {
    CODEX_API_KEY: process.env.CODEX_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    NPM_TOKEN: process.env.NPM_TOKEN,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  };
}

function redactText(value: string): string {
  return redactSecrets(value, knownSecrets()).value;
}
