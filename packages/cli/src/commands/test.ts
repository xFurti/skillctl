import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { Command } from 'commander';
import { confirm } from '@clack/prompts';
import { getProjectSkillsStore, requireLeogrielProject, writeArtifact } from '@leogriel/core';
import { CodexRunner, loadTestFile, runSkillTests, type SkillTestFile } from '@leogriel/testing';
import { loadLockfile } from '@leogriel/lockfile';
import { cliLog, cliWarn } from '../lib/output.js';
import { handleCommandError, LeogrielError } from '../lib/errors.js';

export function registerTest(program: Command, version: string): void {
  const command = program.command('test [skill]').description('Run experimental paired behavioral tests')
    .option('--agent <agent>', 'agent runner', 'codex')
    .option('--runs <number>', 'paired runs per test case', '3')
    .option('--json', 'machine-readable envelope output')
    .option('--output <file>', 'persist a versioned result artifact')
    .option('--timeout <ms>', 'agent timeout in milliseconds', '120000')
    .option('--keep-workspace', 'persist workspaces under .leogriel/artifacts/test')
    .option('--model <model>', 'pin a runner model')
    .option('--trust-tests', 'allow command assertions without an interactive confirmation')
    .action(async (skill, options) => {
      if (!skill) return;
      try {
        if (options.agent !== 'codex') throw new LeogrielError('Only the codex runner is available in 1.0.0-beta.2', 'UNSUPPORTED_RUNNER', 2);
        const cwd = await requireLeogrielProject();
        const testPath = await findTestFile(cwd, skill);
        const testFile = await loadTestFile(testPath);
        await authorizeCommands(testFile, Boolean(options.trustTests));
        const skillPath = await findSkillPath(cwd, skill);
        const lock = await loadLockfile(cwd);
        const result = await runSkillTests(testFile, {
          testFilePath: testPath,
          skillPath,
          runner: new CodexRunner(),
          runs: parseRuns(options.runs),
          model: options.model,
          timeoutMs: parsePositive(options.timeout, '--timeout'),
          keepWorkspace: Boolean(options.keepWorkspace),
          leogrielVersion: version,
          lockfileEntry: lock?.skills[safeName(skill)],
          projectRoot: cwd,
        });
        if (result.warning) cliWarn(result.warning);
        if (options.keepWorkspace) cliWarn('Kept workspaces may contain sensitive agent-generated files or output. Credentials and isolated HOME/XDG/CODEX_HOME directories were not copied intentionally.');
        if (options.output) {
          const artifact = await writeArtifact('test', options.output, result, {
            cwd,
            knownSecrets: { CODEX_API_KEY: process.env.CODEX_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY },
          });
          cliLog(JSON.stringify({ ...result, artifact: artifact.path }, null, 2));
        } else cliLog(JSON.stringify(result, null, 2));
        process.exitCode = result.verdict === 'regressed' ? 1 : result.verdict === 'inconclusive' ? 1 : 0;
      } catch (error) { handleCommandError(error, 'test'); }
    });

  command.command('init <skill>').description('Create a version-1 behavioral test YAML').option('--json').action(async (skill) => {
    try {
      const cwd = await requireLeogrielProject();
      const target = join(cwd, '.leogriel', 'tests', `${safeName(skill)}.yaml`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, template(skill), { encoding: 'utf8', flag: 'wx' });
      cliLog(JSON.stringify({ path: target, version: 1, skill }, null, 2));
    } catch (error) { handleCommandError(error, 'test init'); }
  });

  command.command('validate [file]').description('Validate test YAML without executing assertions').option('--json').action(async (file) => {
    try {
      const cwd = await requireLeogrielProject();
      const files = file ? [resolve(cwd, file)] : await listTestFiles(cwd);
      const validated = [];
      for (const path of files) {
        const parsed = await loadTestFile(path);
        validated.push({ path, skill: parsed.skill, cases: parsed.cases.length });
      }
      cliLog(JSON.stringify({ valid: true, files: validated }, null, 2));
    } catch (error) { handleCommandError(error, 'test validate'); }
  });

  command.command('list').description('List project behavioral test files').option('--json').action(async () => {
    try {
      const cwd = await requireLeogrielProject();
      const files = await listTestFiles(cwd);
      const tests = await Promise.all(files.map(async (path) => {
        const parsed = await loadTestFile(path);
        return { path, skill: parsed.skill, cases: parsed.cases.length };
      }));
      cliLog(JSON.stringify(tests, null, 2));
    } catch (error) { handleCommandError(error, 'test list'); }
  });
}

async function authorizeCommands(testFile: SkillTestFile, trusted: boolean): Promise<void> {
  const commands = testFile.cases.flatMap((testCase) => testCase.assertions.filter((item) => item.type === 'command'));
  if (!commands.length || trusted) return;
  const details = commands.map((item) => `${item.executable} ${(item.argv || []).join(' ')} (cwd: ${item.cwd || '.'})`).join('\n');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new LeogrielError(`Command assertions require --trust-tests in non-interactive mode:\n${details}`, 'UNTRUSTED_TEST_COMMAND', 2);
  const approved = await confirm({ message: `Test commands can execute arbitrary user code:\n${details}\nContinue?` });
  if (approved !== true) throw new LeogrielError('Command assertions were not authorized', 'UNTRUSTED_TEST_COMMAND', 2);
}

async function findTestFile(cwd: string, skill: string): Promise<string> {
  for (const extension of ['yaml', 'yml']) {
    const path = join(cwd, '.leogriel', 'tests', `${safeName(skill)}.${extension}`);
    if (await access(path).then(() => true).catch(() => false)) return path;
  }
  throw new LeogrielError(`No test file found for ${skill}; run leogriel test init ${skill}`, 'TEST_NOT_FOUND', 2);
}

async function findSkillPath(cwd: string, skill: string): Promise<string> {
  const explicit = resolve(cwd, skill);
  if (await access(join(explicit, 'SKILL.md')).then(() => true).catch(() => false)) return explicit;
  const installed = join(getProjectSkillsStore(cwd), safeName(skill));
  if (await access(join(installed, 'SKILL.md')).then(() => true).catch(() => false)) return installed;
  throw new LeogrielError(`Skill not found: ${skill}`, 'SKILL_NOT_FOUND', 2);
}

async function listTestFiles(cwd: string): Promise<string[]> {
  const root = join(cwd, '.leogriel', 'tests');
  return (await readdir(root, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && ['.yaml', '.yml'].includes(extname(entry.name)))
    .map((entry) => join(root, entry.name)).sort();
}

function parsePositive(value: string, flag: string): number {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number < 1) throw new LeogrielError(`${flag} must be a positive integer`, 'INVALID_OPTIONS', 2);
  return number;
}

function parseRuns(value: string): number {
  const number = parsePositive(value, '--runs');
  if (number > 20) throw new LeogrielError('--runs must be between 1 and 20', 'INVALID_OPTIONS', 2);
  return number;
}

function safeName(value: string): string { return basename(value).replace(/[^a-z0-9._-]+/gi, '-').toLowerCase(); }
function template(skill: string): string { return `version: 1\nskill: ${JSON.stringify(skill)}\ncases:\n  - name: creates-output\n    prompt: Create output.txt containing ready.\n    network:\n      mode: deny\n      webSearch: disabled\n    timeout: 120000\n    assertions:\n      - type: file-exists\n        path: output.txt\n      - type: file-contains\n        path: output.txt\n        contains: ready\n`; }
