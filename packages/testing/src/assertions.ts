import { createHash } from 'node:crypto';
import { readFile, readdir, readlink, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { AssertionResult, TestAssertion } from './types.js';
import { runProcess } from './process.js';

export interface WorkspaceSnapshotEntry { path: string; type: 'file' | 'directory' | 'symlink'; size: number; hash: string }
export type WorkspaceSnapshot = Map<string, WorkspaceSnapshotEntry>;

export async function evaluateAssertions(
  assertions: TestAssertion[],
  workspace: string,
  initialFiles: WorkspaceSnapshot,
  options: { timeoutMs: number; environment: NodeJS.ProcessEnv },
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];
  for (const assertion of assertions) {
    try {
      results.push(await evaluate(assertion, workspace, initialFiles, options));
    } catch (error) {
      results.push({ assertion, passed: false, message: (error as Error).message });
    }
  }
  return results;
}

export async function snapshotWorkspace(root: string): Promise<WorkspaceSnapshot> {
  const files: WorkspaceSnapshot = new Map();
  async function walk(path: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const child = join(path, entry.name);
      const portable = relative(root, child).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        files.set(portable, { path: portable, type: 'directory', size: 0, hash: digest('directory') });
        await walk(child);
      } else if (entry.isSymbolicLink()) {
        const target = await readlink(child);
        files.set(portable, { path: portable, type: 'symlink', size: Buffer.byteLength(target), hash: digest(target) });
      } else if (entry.isFile()) {
        const content = await readFile(child);
        files.set(portable, { path: portable, type: 'file', size: content.byteLength, hash: digest(content) });
      }
    }
  }
  await walk(root);
  return files;
}

export const listWorkspaceFiles = snapshotWorkspace;

export function countSnapshotChanges(before: WorkspaceSnapshot, after: WorkspaceSnapshot): number {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => {
    const previous = before.get(path);
    const current = after.get(path);
    if ((!previous || previous.type === 'directory') && (!current || current.type === 'directory')) return false;
    return JSON.stringify(previous) !== JSON.stringify(current);
  }).length;
}

async function evaluate(assertion: TestAssertion, workspace: string, initialFiles: WorkspaceSnapshot, options: { timeoutMs: number; environment: NodeJS.ProcessEnv }): Promise<AssertionResult> {
  if (assertion.type === 'max-changed-files') {
    const current = await snapshotWorkspace(workspace);
    const changed = countSnapshotChanges(initialFiles, current);
    const passed = changed <= (assertion.max ?? 0);
    return result(assertion, passed, `${changed} changed file(s)`);
  }
  if (assertion.type === 'command') return runCommand(assertion, workspace, options);
  const path = contained(workspace, assertion.path || '');
  const exists = Boolean(await stat(path).catch(() => null));
  if (assertion.type === 'file-exists') return result(assertion, exists, exists ? 'file exists' : 'file is missing');
  if (assertion.type === 'file-not-exists' || assertion.type === 'forbidden-path') return result(assertion, !exists, exists ? 'forbidden file exists' : 'file is absent');
  if (!exists) return result(assertion, false, 'file is missing');
  const content = await readFile(path, 'utf8');
  if (assertion.type === 'file-contains') return result(assertion, content.includes(assertion.contains || ''), 'content check');
  if (assertion.type === 'file-not-contains') return result(assertion, !content.includes(assertion.contains || ''), 'negative content check');
  if (assertion.type === 'regex') return result(assertion, new RegExp(assertion.pattern || '').test(content), 'regular expression check');
  if (assertion.type === 'snapshot') return result(assertion, content === (assertion.snapshot || ''), 'snapshot check');
  if (assertion.type === 'json-schema') {
    const value = JSON.parse(content);
    const passed = validateJsonShape(value, assertion.schema || {});
    return result(assertion, passed, 'JSON schema shape check');
  }
  return result(assertion, false, `Unsupported assertion ${assertion.type}`);
}

async function runCommand(assertion: TestAssertion, workspace: string, options: { timeoutMs: number; environment: NodeJS.ProcessEnv }): Promise<AssertionResult> {
  const cwd = contained(workspace, assertion.cwd || '.');
  const executed = await runProcess(assertion.executable!, assertion.argv || [], {
    cwd, env: options.environment, timeoutMs: options.timeoutMs, maxOutputBytes: 64 * 1024,
  });
  return result(assertion, !executed.timedOut && executed.code === 0, executed.timedOut ? 'command timed out' : `command exited ${executed.code}`);
}

function contained(root: string, path: string): string {
  const candidate = resolve(root, path);
  const rel = relative(resolve(root), candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Assertion path escapes workspace');
  return candidate;
}

function result(assertion: TestAssertion, passed: boolean, message: string): AssertionResult { return { assertion, passed, message }; }
function digest(value: string | Buffer): string { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }

function validateJsonShape(value: unknown, schema: Record<string, unknown>): boolean {
  if ('const' in schema && !Object.is(value, schema.const)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) return false;
  if (schema.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) return false;
  if (schema.type === 'array' && !Array.isArray(value)) return false;
  if (schema.type === 'string' && typeof value !== 'string') return false;
  if (schema.type === 'number' && typeof value !== 'number') return false;
  if (schema.type === 'integer' && (!Number.isInteger(value))) return false;
  if (schema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (Array.isArray(schema.required) && (!value || typeof value !== 'object' || schema.required.some((key) => typeof key !== 'string' || !(key in value)))) return false;
  if (schema.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, childSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
      if (key in value && (!childSchema || typeof childSchema !== 'object' || !validateJsonShape((value as Record<string, unknown>)[key], childSchema as Record<string, unknown>))) return false;
    }
  }
  if (schema.items && Array.isArray(value) && typeof schema.items === 'object') {
    if (!value.every((item) => validateJsonShape(item, schema.items as Record<string, unknown>))) return false;
  }
  if (typeof schema.pattern === 'string' && (typeof value !== 'string' || !new RegExp(schema.pattern).test(value))) return false;
  return true;
}
