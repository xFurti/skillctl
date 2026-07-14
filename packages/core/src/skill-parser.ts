import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { load } from 'js-yaml';
import { canonicalizeName } from './names.js';
import { computeDirIntegrity, computeFileHash } from './fs.js';

export interface SkillResource {
  path: string;
  absolutePath: string;
  size: number;
  integrity: string;
}

export interface SkillParseDiagnostic {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  path?: string;
}

export interface ParsedSkill {
  name: string;
  description: string;
  instructions: string;
  frontmatter: Record<string, unknown>;
  scripts: SkillResource[];
  references: SkillResource[];
  assets: SkillResource[];
  path: string;
  root: string;
  integrity: string;
  diagnostics: SkillParseDiagnostic[];
}

export interface ParseSkillOptions {
  validation?: 'strict' | 'collect';
  maxMarkdownBytes?: number;
  maxFiles?: number;
  maxTotalBytes?: number;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

export async function parseSkillDirectory(directory: string, options: ParseSkillOptions = {}): Promise<ParsedSkill> {
  const root = resolve(directory);
  const validation = options.validation || 'strict';
  const diagnostics: SkillParseDiagnostic[] = [];
  const rootReal = await realpath(root);
  const rootEntries = new Set(await readdir(root));
  const candidates: string[] = [];
  for (const name of ['SKILL.md', 'skill.md']) {
    if (!rootEntries.has(name)) continue;
    const path = join(root, name);
    const stats = await lstat(path).catch(() => null);
    if (stats?.isFile()) candidates.push(path);
  }
  if (!candidates.length) throw new Error(`SKILL.md not found in ${root}`);
  if (candidates.length > 1) throw new Error(`Both SKILL.md and skill.md exist in ${root}`);
  const path = candidates[0];
  const bytes = await readFile(path);
  if (bytes.byteLength > (options.maxMarkdownBytes ?? 1024 * 1024)) throw new Error('SKILL.md exceeds the 1 MiB limit');
  let content: string;
  try { content = decoder.decode(bytes).replace(/^\uFEFF/, ''); }
  catch { throw new Error('SKILL.md is not valid UTF-8'); }

  let frontmatter: Record<string, unknown> = {};
  let instructions = content;
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (match) {
    instructions = content.slice(match[0].length);
    try {
      const parsed = load(match[1]);
      if (parsed != null && (typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('frontmatter must be a mapping');
      frontmatter = (parsed || {}) as Record<string, unknown>;
    } catch (error) {
      const diagnostic = { code: 'INVALID_YAML', severity: 'error' as const, message: (error as Error).message, path };
      diagnostics.push(diagnostic);
      if (validation === 'strict') throw new Error(`Invalid SKILL.md YAML: ${diagnostic.message}`);
    }
  }

  let name: string;
  if (typeof frontmatter.name === 'string' && frontmatter.name.trim()) name = canonicalizeName(frontmatter.name);
  else {
    name = canonicalizeName(basename(root));
    diagnostics.push({ code: 'MISSING_NAME', severity: 'error', message: `Missing frontmatter name; using ${name}`, path });
    if (validation === 'strict') throw new Error('SKILL.md frontmatter requires name');
  }
  const description = typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '';
  if (!description) diagnostics.push({ code: 'MISSING_DESCRIPTION', severity: 'warning', message: 'SKILL.md has no description', path });

  const limits = { files: options.maxFiles ?? 1000, bytes: options.maxTotalBytes ?? 50 * 1024 * 1024 };
  const counters = { files: 0, bytes: 0 };
  const [scripts, references, assets] = await Promise.all([
    collectResources(root, rootReal, 'scripts', limits, counters),
    collectResources(root, rootReal, 'references', limits, counters),
    collectResources(root, rootReal, 'assets', limits, counters),
  ]);
  await validateTree(root, rootReal, limits, counters);
  return {
    name,
    description,
    instructions,
    frontmatter,
    scripts,
    references,
    assets,
    path,
    root,
    integrity: await computeDirIntegrity(root),
    diagnostics,
  };
}

async function collectResources(
  root: string,
  rootReal: string,
  folder: string,
  limits: { files: number; bytes: number },
  counters: { files: number; bytes: number },
): Promise<SkillResource[]> {
  const base = join(root, folder);
  if (!(await lstat(base).catch(() => null))) return [];
  const files: SkillResource[] = [];
  await walkContained(base, root, rootReal, async (path, size) => {
    track(size, limits, counters);
    files.push({ path: portable(relative(root, path)), absolutePath: path, size, integrity: await computeFileHash(path) });
  });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function validateTree(root: string, rootReal: string, limits: { files: number; bytes: number }, counters: { files: number; bytes: number }): Promise<void> {
  await walkContained(root, root, rootReal, async (path, size) => {
    if (/^(?:scripts|references|assets)(?:[\\/]|$)/.test(relative(root, path))) return;
    track(size, limits, counters);
  });
}

async function walkContained(current: string, root: string, rootReal: string, visit: (path: string, size: number) => Promise<void>): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = join(current, entry.name);
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      const target = await realpath(path);
      if (!inside(rootReal, target)) throw new Error(`Symlink escapes skill root: ${portable(relative(root, path))}`);
      throw new Error(`Symlinks are not accepted in parsed skill resources: ${portable(relative(root, path))}`);
    }
    if (stats.isDirectory()) await walkContained(path, root, rootReal, visit);
    else if (stats.isFile()) await visit(path, stats.size);
  }
}

function track(size: number, limits: { files: number; bytes: number }, counters: { files: number; bytes: number }): void {
  counters.files++;
  counters.bytes += size;
  if (counters.files > limits.files) throw new Error(`Skill exceeds ${limits.files} files`);
  if (counters.bytes > limits.bytes) throw new Error(`Skill exceeds ${limits.bytes} bytes`);
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function portable(path: string): string { return path.replaceAll('\\', '/'); }
