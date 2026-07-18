import { isAbsolute, join, relative } from 'node:path';
import type { AgentRunRequest, AgentRunResult, AgentRunner, RunnerDetection } from './types.js';
import { isolatedEnvironment, type IsolationLayout } from './isolation.js';
import { runProcess } from './process.js';

const REQUIRED_FLAGS = ['--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--sandbox', '--strict-config', '--skip-git-repo-check'];
const SAFE_TOOL_ENV = ['PATH', 'Path', 'PATHEXT', 'HOME', 'USERPROFILE', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'SYSTEMROOT', 'COMSPEC', 'TEMP', 'TMP'];

export interface CodexRunnerOptions {
  command?: string;
  commandArgs?: string[];
  maxOutputBytes?: number;
}

export class CodexRunner implements AgentRunner {
  readonly id = 'codex';
  private detection?: RunnerDetection;

  constructor(private readonly options: CodexRunnerOptions = {}) {}

  async detect(): Promise<RunnerDetection> {
    if (this.detection) return this.detection;
    try {
      const versionResult = await this.invoke(['--version'], 10_000);
      if (versionResult.code !== 0) throw new Error(versionResult.stderr || `codex --version exited ${versionResult.code}`);
      const version = versionResult.stdout.trim();
      const helpResult = await this.invoke(['exec', '--help'], 10_000);
      if (helpResult.code !== 0) throw new Error(helpResult.stderr || `codex exec --help exited ${helpResult.code}`);
      const missing = REQUIRED_FLAGS.filter((flag) => !helpResult.stdout.includes(flag));
      if (missing.length) return this.detection = { available: false, version, capabilities: [], reason: `Codex CLI lacks required flags: ${missing.join(', ')}` };
      return this.detection = {
        available: true,
        version,
        capabilities: [
          'isolated home directories', 'environment filtering', 'network deny', 'network allow',
          'web search control', 'strict config validation', 'resolved model reporting', 'json events',
        ],
      };
    } catch (error) {
      return this.detection = { available: false, capabilities: [], reason: (error as Error).message };
    }
  }

  async preflight(policies: AgentRunRequest['network'][]): Promise<void> {
    const detection = await this.detect();
    if (!detection.available) throw new Error(detection.reason || 'Codex runner unavailable');
    if (!policies.length) throw new Error('Codex runner requires an explicit network policy');
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const started = Date.now();
    if (request.auth.mode === 'chatgpt' && (process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY)) {
      return incompleteAuthResult(request, started, 'ChatGPT authentication cannot be combined with CODEX_API_KEY or OPENAI_API_KEY');
    }
    const detection = await this.detect();
    if (!detection.available) throw new Error(detection.reason || 'Codex runner unavailable');
    const layout = layoutFromRequest(request);
    const args = [
      'exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config',
      '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', request.workspace,
      ...configArgs(request.network),
    ];
    if (request.requestedModel) args.push('--model', request.requestedModel);
    args.push('-');
    const baseEnvironment = isolatedEnvironment(layout);
    if (request.auth.mode === 'chatgpt') {
      if (isInside(request.isolationRoot, request.auth.codexHome)) {
        return incompleteAuthResult(request, started, 'LEOGRIEL_CODEX_AUTH_HOME must be outside the temporary isolation root');
      }
      const status = await this.invoke(['login', 'status'], 10_000, {
        env: { ...baseEnvironment, CODEX_HOME: request.auth.codexHome },
        maxOutputBytes: 64 * 1024,
      });
      if (status.code !== 0 || status.timedOut || status.truncated) {
        return incompleteAuthResult(
          request,
          started,
          'The dedicated ChatGPT profile is not authenticated. Set CODEX_HOME to LEOGRIEL_CODEX_AUTH_HOME, run `codex login`, then retry.',
        );
      }
    }
    const environment = request.auth.mode === 'chatgpt'
      ? { ...baseEnvironment, CODEX_HOME: request.auth.codexHome }
      : { ...baseEnvironment, CODEX_API_KEY: request.auth.apiKey };
    const knownSecrets = request.auth.mode === 'api-key'
      ? { CODEX_API_KEY: request.auth.apiKey, OPENAI_API_KEY: request.auth.apiKey }
      : {};
    const processResult = await this.invoke(args, request.timeoutMs, {
      env: environment,
      input: request.prompt,
      maxOutputBytes: this.options.maxOutputBytes,
      knownSecrets,
    });
    const parsed = parseCodexJsonl(processResult.stdout, processResult.truncated);
    const exitError = processResult.code === 0 ? undefined : processResult.stderr.trim() || `Codex exited with code ${processResult.code}`;
    const error = processResult.timedOut
      ? 'Codex execution timed out'
      : processResult.truncated
        ? parsed.error
        : exitError || parsed.error;
    return {
      ok: !error && parsed.completed,
      exitCode: processResult.code,
      durationMs: Date.now() - started,
      tokens: parsed.tokenUsage?.total,
      tokenUsage: parsed.tokenUsage,
      requestedModel: request.requestedModel || null,
      resolvedModel: parsed.resolvedModel,
      output: processResult.stdout,
      stderr: processResult.stderr,
      error,
      timedOut: processResult.timedOut,
      incomplete: !parsed.completed || Boolean(error),
      outputTruncated: processResult.truncated,
    };
  }

  private invoke(
    args: string[],
    timeoutMs: number,
    options: {
      env?: NodeJS.ProcessEnv;
      input?: string;
      maxOutputBytes?: number;
      knownSecrets?: Record<string, string | undefined>;
    } = {},
  ) {
    const environment = options.env || process.env;
    return runProcess(this.options.command || 'codex', [...(this.options.commandArgs || []), ...args], {
      timeoutMs,
      env: environment,
      input: options.input,
      maxOutputBytes: options.maxOutputBytes,
      knownSecrets: options.knownSecrets || {
        CODEX_API_KEY: environment.CODEX_API_KEY,
        OPENAI_API_KEY: environment.OPENAI_API_KEY,
      },
    });
  }
}

function incompleteAuthResult(request: AgentRunRequest, started: number, error: string): AgentRunResult {
  return {
    ok: false,
    exitCode: null,
    durationMs: Date.now() - started,
    requestedModel: request.requestedModel || null,
    output: '',
    stderr: '',
    error,
    incomplete: true,
  };
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function configArgs(policy: AgentRunRequest['network']): string[] {
  return [
    '-c', 'shell_environment_policy.inherit="all"',
    '-c', 'shell_environment_policy.ignore_default_excludes=false',
    '-c', `shell_environment_policy.include_only=${JSON.stringify(SAFE_TOOL_ENV)}`,
    '-c', `sandbox_workspace_write.network_access=${policy.mode === 'allow' ? 'true' : 'false'}`,
    '-c', `web_search="${policy.webSearch}"`,
  ];
}

function layoutFromRequest(request: AgentRunRequest): IsolationLayout {
  const child = (name: string) => join(request.isolationRoot, name);
  return {
    root: request.isolationRoot,
    workspace: request.workspace,
    home: child('home'), userprofile: child('userprofile'), xdgConfig: child('xdg-config'),
    xdgData: child('xdg-data'), xdgCache: child('xdg-cache'), codexHome: child('codex-home'),
    temp: child('temp'), tmp: child('tmp'),
  };
}

interface ParsedCodexOutput {
  completed: boolean;
  error?: string;
  resolvedModel?: string;
  tokenUsage?: NonNullable<AgentRunResult['tokenUsage']>;
}

export function parseCodexJsonl(output: string, truncated = false): ParsedCodexOutput {
  if (truncated) return { completed: false, error: 'Codex JSONL output exceeded the configured limit' };
  const lines = output.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { completed: false, error: 'Codex produced no JSONL events' };
  const events: Record<string, unknown>[] = [];
  for (const [index, line] of lines.entries()) {
    try {
      const event = JSON.parse(line) as unknown;
      if (!event || typeof event !== 'object' || Array.isArray(event) || typeof (event as Record<string, unknown>).type !== 'string') throw new Error('event must be an object with type');
      events.push(event as Record<string, unknown>);
    } catch (error) {
      return { completed: false, error: `Invalid Codex JSONL at line ${index + 1}: ${(error as Error).message}` };
    }
  }
  const started = events.some((event) => event.type === 'thread.started' || event.type === 'turn.started');
  const terminal = [...events].reverse().find((event) => event.type === 'turn.completed' || event.type === 'turn.failed');
  if (!started || !terminal) return { completed: false, error: 'Codex JSONL is missing required start or final events' };
  if (terminal.type === 'turn.failed') return { completed: false, error: eventMessage(terminal) || 'Codex turn failed' };
  const resolvedModel = events.map(findModel).find(Boolean);
  return { completed: true, resolvedModel, tokenUsage: parseUsage(terminal.usage) };
}

function parseUsage(value: unknown): NonNullable<AgentRunResult['tokenUsage']> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const usage = value as Record<string, unknown>;
  const input = numeric(usage.input_tokens ?? usage.inputTokens);
  const cachedInput = numeric(usage.cached_input_tokens ?? usage.cachedInputTokens);
  const output = numeric(usage.output_tokens ?? usage.outputTokens);
  const reasoning = numeric(usage.reasoning_tokens ?? usage.reasoning_output_tokens ?? usage.reasoningTokens);
  const suppliedTotal = numeric(usage.total_tokens ?? usage.totalTokens);
  const total = suppliedTotal || input + output + reasoning;
  return { input, cachedInput, output, reasoning, total };
}

function numeric(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0; }
function eventMessage(event: Record<string, unknown>): string | undefined { return typeof event.message === 'string' ? event.message : undefined; }
function findModel(event: Record<string, unknown>): string | undefined {
  for (const key of ['model', 'resolved_model', 'resolvedModel']) if (typeof event[key] === 'string') return event[key] as string;
  for (const value of Object.values(event)) if (value && typeof value === 'object' && !Array.isArray(value)) {
    const nested = findModel(value as Record<string, unknown>);
    if (nested) return nested;
  }
  return undefined;
}
