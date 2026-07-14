import { cp, lstat, mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

const FORBIDDEN_NAMES = new Set([
  '.codex', '.claude', '.agents', '.cursor', '.gemini', '.grok', '.opencode', '.pi',
  'AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md',
]);

export interface IsolationLayout {
  root: string;
  workspace: string;
  home: string;
  userprofile: string;
  xdgConfig: string;
  xdgData: string;
  xdgCache: string;
  codexHome: string;
  temp: string;
  tmp: string;
}

export async function createIsolation(fixture?: string): Promise<IsolationLayout> {
  if (fixture) await validateFixture(fixture);
  const root = await mkdtemp(join(tmpdir(), 'skillctl-test-isolation-'));
  const layout: IsolationLayout = {
    root,
    workspace: join(root, 'workspace'),
    home: join(root, 'home'),
    userprofile: join(root, 'userprofile'),
    xdgConfig: join(root, 'xdg-config'),
    xdgData: join(root, 'xdg-data'),
    xdgCache: join(root, 'xdg-cache'),
    codexHome: join(root, 'codex-home'),
    temp: join(root, 'temp'),
    tmp: join(root, 'tmp'),
  };
  await Promise.all(Object.values(layout).filter((path) => path !== root).map((path) => mkdir(path, { recursive: true })));
  if (fixture) await cp(fixture, layout.workspace, { recursive: true, force: false, errorOnExist: false });
  return layout;
}

export async function validateFixture(root: string): Promise<void> {
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Fixture root cannot be a symbolic link');
  async function walk(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Fixture contains a symbolic link: ${entry.name}`);
      if (FORBIDDEN_NAMES.has(entry.name) || (entry.isDirectory() && /^skills?$/i.test(entry.name) && isAgentSpecific(path))) {
        throw new Error(`Fixture contains undeclared agent configuration: ${entry.name}`);
      }
      if (entry.isDirectory()) await walk(join(path, entry.name));
    }
  }
  await walk(root);
}

export async function resolveFixturePath(testFilePath: string, fixture: string, projectRoot?: string): Promise<string> {
  if (!fixture.trim() || isAbsolute(fixture) || fixture.split(/[\\/]/).includes('..')) throw new Error('Fixture path must be project-relative and cannot contain ..');
  const allowedRoot = resolve(projectRoot || dirname(testFilePath));
  const candidate = resolve(dirname(testFilePath), fixture);
  assertInside(allowedRoot, candidate);
  const [allowedReal, candidateReal] = await Promise.all([realpath(allowedRoot), realpath(candidate)]);
  assertInside(allowedReal, candidateReal);
  await validateFixture(candidate);
  return candidate;
}

export async function installTestSkill(workspace: string, skillPath: string, name: string): Promise<void> {
  const target = join(workspace, '.codex', 'skills', name);
  await mkdir(join(workspace, '.codex', 'skills'), { recursive: true });
  await cp(skillPath, target, { recursive: true, force: false, errorOnExist: true });
}

export function isolatedEnvironment(layout: IsolationLayout): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    Path: process.env.Path,
    PATHEXT: process.env.PATHEXT,
    SYSTEMROOT: process.env.SYSTEMROOT,
    COMSPEC: process.env.COMSPEC,
    TEMP: layout.temp,
    TMP: layout.tmp,
    HOME: layout.home,
    USERPROFILE: layout.userprofile,
    XDG_CONFIG_HOME: layout.xdgConfig,
    XDG_DATA_HOME: layout.xdgData,
    XDG_CACHE_HOME: layout.xdgCache,
    CODEX_HOME: layout.codexHome,
  };
}

function assertInside(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Fixture path escapes the project fixture root');
}

export async function destroyIsolation(layout: IsolationLayout): Promise<void> {
  await rm(layout.root, { recursive: true, force: true });
}

function isAgentSpecific(path: string): boolean {
  return /(?:codex|claude|agents|cursor|gemini|grok|opencode|\.pi)/i.test(basename(path));
}
