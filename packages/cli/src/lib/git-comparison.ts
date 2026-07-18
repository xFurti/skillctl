import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SKILL_BYTES = 100 * 1024 * 1024;

export interface MaterializedGitSkill {
  root: string;
  skillPath: string;
  requestedRef: string;
  commit: string;
  repositoryRoot: string;
  relativeSkillPath: string;
}

export async function materializeGitSkill(
  cwd: string,
  currentSkillPath: string,
  requestedRef: string,
): Promise<MaterializedGitSkill> {
  if (!requestedRef.trim() || requestedRef.includes('\0')) throw new Error('--compare requires a valid Git ref');
  const repositoryRoot = await realpath(resolve((await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()));
  const canonicalSkillPath = await realpath(resolve(currentSkillPath));
  const relativeSkillPath = portable(relative(repositoryRoot, canonicalSkillPath));
  if (!relativeSkillPath || relativeSkillPath.startsWith('../') || isAbsolute(relativeSkillPath)) {
    throw new Error('The compared skill must be inside the current Git repository');
  }
  const commit = (await gitText(repositoryRoot, [
    'rev-parse', '--verify', '--end-of-options', `${requestedRef}^{commit}`,
  ])).trim();
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error(`Git ref did not resolve to a full commit: ${requestedRef}`);

  const listing = await gitBuffer(repositoryRoot, ['ls-tree', '-r', '-z', commit, '--', relativeSkillPath]);
  const records = listing.toString('utf8').split('\0').filter(Boolean);
  if (!records.length) throw new Error(`Skill ${relativeSkillPath} does not exist at ${requestedRef}`);
  const root = await mkdtemp(join(tmpdir(), 'leogriel-git-compare-'));
  const skillPath = join(root, basename(relativeSkillPath));
  let totalBytes = 0;
  try {
    for (const record of records) {
      const match = /^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]+)$/.exec(record);
      if (!match) throw new Error(`Invalid git tree entry for ${requestedRef}`);
      const [, mode, type, object, repositoryPath] = match;
      if (type !== 'blob' || mode === '120000') throw new Error(`Git comparison rejects non-file or symlink entry: ${repositoryPath}`);
      const pathInsideSkill = portable(relative(relativeSkillPath, repositoryPath));
      if (!pathInsideSkill || pathInsideSkill.startsWith('../') || isAbsolute(pathInsideSkill)) {
        throw new Error(`Git comparison entry escapes the skill directory: ${repositoryPath}`);
      }
      const size = Number.parseInt((await gitText(repositoryRoot, ['cat-file', '-s', object])).trim(), 10);
      if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) throw new Error(`Git comparison file is too large: ${repositoryPath}`);
      totalBytes += size;
      if (totalBytes > MAX_SKILL_BYTES) throw new Error('Git comparison skill exceeds the extraction size limit');
      const content = await gitBuffer(repositoryRoot, ['cat-file', 'blob', object], MAX_FILE_BYTES);
      if (content.length !== size) throw new Error(`Git comparison object size changed: ${repositoryPath}`);
      const destination = resolve(skillPath, ...pathInsideSkill.split('/'));
      assertInside(skillPath, destination);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content, { flag: 'wx' });
      if (mode === '100755' && process.platform !== 'win32') await chmod(destination, 0o755);
    }
    return { root, skillPath, requestedRef, commit, repositoryRoot, relativeSkillPath };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function removeMaterializedGitSkill(value: MaterializedGitSkill | undefined): Promise<void> {
  if (value) await rm(value.root, { recursive: true, force: true });
}

function gitText(cwd: string, args: string[]): Promise<string> {
  return gitBuffer(cwd, args, 4 * 1024 * 1024).then((value) => value.toString('utf8'));
}

function gitBuffer(cwd: string, args: string[], maxBuffer = 8 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    execFile('git', args, { cwd, encoding: 'buffer', maxBuffer, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const detail = Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : String(stderr || '').trim();
        reject(new Error(detail || `git ${args[0]} failed`));
        return;
      }
      resolvePromise(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
    });
  });
}

function portable(value: string): string {
  return value.split(sep).join('/');
}

function assertInside(root: string, candidate: string): void {
  const path = relative(resolve(root), candidate);
  if (path.startsWith('..') || isAbsolute(path)) throw new Error('Git comparison path escapes its temporary root');
}
