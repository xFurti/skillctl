import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';
import type { NetworkPolicy, SkillTestFile, TestAssertion } from './types.js';

const ASSERTIONS = new Set(['file-exists', 'file-not-exists', 'file-contains', 'file-not-contains', 'regex', 'command', 'json-schema', 'snapshot', 'forbidden-path', 'max-changed-files']);
const DEFAULT_NETWORK: NetworkPolicy = { mode: 'deny', webSearch: 'disabled' };

export async function loadTestFile(path: string): Promise<SkillTestFile> {
  const parsed = load(await readFile(path, 'utf8')) as unknown;
  return validateTestFile(parsed);
}

export function validateTestFile(value: unknown): SkillTestFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Test YAML must be a mapping');
  const input = value as Record<string, unknown>;
  if (input.version !== 1) throw new Error('Test YAML version must be 1');
  if (typeof input.skill !== 'string' || !input.skill.trim()) throw new Error('Test YAML requires skill');
  if (!Array.isArray(input.cases) || !input.cases.length) throw new Error('Test YAML requires at least one case');
  const cases = input.cases.map((raw, index) => validateCase(raw, index));
  const names = new Set<string>();
  for (const testCase of cases) {
    if (names.has(testCase.name)) throw new Error(`Duplicate case name: ${testCase.name}`);
    names.add(testCase.name);
  }
  return { version: 1, skill: input.skill, cases };
}

function validateCase(value: unknown, index: number): SkillTestFile['cases'][number] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Case ${index + 1} must be a mapping`);
  const input = value as Record<string, unknown>;
  if (typeof input.name !== 'string' || !input.name.trim() || typeof input.prompt !== 'string' || !input.prompt.trim()) throw new Error(`Case ${index + 1} requires name and prompt`);
  if (!Array.isArray(input.assertions) || !input.assertions.length) throw new Error(`Case ${input.name} requires assertions`);
  const network = validateNetwork(input.network);
  return {
    name: input.name,
    prompt: input.prompt,
    fixture: typeof input.fixture === 'string' ? input.fixture : undefined,
    assertions: input.assertions.map(validateAssertion),
    budget: validateBudget(input.budget, input.name),
    timeout: validatePositiveInteger(input.timeout, `Case ${input.name} timeout`),
    network,
    runner: validateRunner(input.runner, input.name),
  } as SkillTestFile['cases'][number];
}

function validateAssertion(value: unknown): TestAssertion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Assertion must be a mapping');
  const input = value as Record<string, unknown>;
  if (typeof input.type !== 'string' || !ASSERTIONS.has(input.type)) throw new Error(`Unsupported assertion type: ${String(input.type)}`);
  const type = input.type;
  if (['file-exists', 'file-not-exists', 'file-contains', 'file-not-contains', 'regex', 'json-schema', 'snapshot', 'forbidden-path'].includes(type)
    && (typeof input.path !== 'string' || !input.path.trim())) throw new Error(`${type} assertion requires path`);
  if ((type === 'file-contains' || type === 'file-not-contains') && typeof input.contains !== 'string') throw new Error(`${type} assertion requires contains`);
  if (type === 'regex') {
    if (typeof input.pattern !== 'string') throw new Error('regex assertion requires pattern');
    try { new RegExp(input.pattern); } catch { throw new Error('regex assertion pattern is invalid'); }
  }
  if (type === 'json-schema' && (!input.schema || typeof input.schema !== 'object' || Array.isArray(input.schema))) throw new Error('json-schema assertion requires schema');
  if (type === 'snapshot' && typeof input.snapshot !== 'string') throw new Error('snapshot assertion requires snapshot');
  if (type === 'command') {
    if (typeof input.executable !== 'string' || !input.executable.trim()) throw new Error('command assertion requires executable');
    if (!Array.isArray(input.argv) || input.argv.some((item) => typeof item !== 'string')) throw new Error('command assertion requires argv as string[]');
    if (input.cwd !== undefined && typeof input.cwd !== 'string') throw new Error('command assertion cwd must be a string');
  }
  if (type === 'max-changed-files' && (!Number.isInteger(input.max) || (input.max as number) < 0)) throw new Error('max-changed-files assertion requires a non-negative max');
  return { ...input, required: input.required !== false } as TestAssertion;
}

function validateNetwork(value: unknown): NetworkPolicy {
  if (value == null) return { ...DEFAULT_NETWORK };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('network must be a mapping');
  const input = value as Record<string, unknown>;
  const mode = input.mode ?? 'deny';
  const webSearch = input.webSearch ?? 'disabled';
  if (mode !== 'deny' && mode !== 'allow') throw new Error('network.mode must be deny or allow');
  if (!['disabled', 'cached', 'live'].includes(String(webSearch))) throw new Error('network.webSearch must be disabled, cached, or live');
  return { mode, webSearch: webSearch as NetworkPolicy['webSearch'] };
}

function validateBudget(value: unknown, name: unknown): SkillTestFile['cases'][number]['budget'] {
  if (value == null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Case ${String(name)} budget must be a mapping`);
  const budget = value as Record<string, unknown>;
  const maxDurationMs = validatePositiveInteger(budget.maxDurationMs, `Case ${String(name)} budget.maxDurationMs`);
  const maxTokens = validateNonNegativeInteger(budget.maxTokens, `Case ${String(name)} budget.maxTokens`);
  const maxChangedFiles = validateNonNegativeInteger(budget.maxChangedFiles, `Case ${String(name)} budget.maxChangedFiles`);
  return { maxDurationMs, maxTokens, maxChangedFiles };
}

function validateRunner(value: unknown, name: unknown): SkillTestFile['cases'][number]['runner'] {
  if (value == null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Case ${String(name)} runner must be a mapping`);
  const runner = value as Record<string, unknown>;
  if (runner.id !== undefined && (typeof runner.id !== 'string' || !runner.id.trim())) throw new Error(`Case ${String(name)} runner.id must be a string`);
  if (runner.model !== undefined && (typeof runner.model !== 'string' || !runner.model.trim())) throw new Error(`Case ${String(name)} runner.model must be a string`);
  return { id: runner.id as string | undefined, model: runner.model as string | undefined };
}

function validatePositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer`);
  return value as number;
}

function validateNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer`);
  return value as number;
}
