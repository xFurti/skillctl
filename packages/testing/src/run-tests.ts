import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { canonicalizeName, computeFileHash, parseSkillDirectory } from '@skillctl/core';
import { countSnapshotChanges, evaluateAssertions, snapshotWorkspace } from './assertions.js';
import { createIsolation, destroyIsolation, installTestSkill, isolatedEnvironment, resolveFixturePath } from './isolation.js';
import { resolveCodexAuth } from './auth.js';
import { caseVerdict, skillVerdict } from './verdicts.js';
import type { AgentRunner, CaseResult, SkillTestFile, SkillTestResult, VariantResult } from './types.js';

export interface RunSkillTestsOptions {
  testFilePath: string;
  skillPath: string;
  runner: AgentRunner;
  runs?: number;
  seed?: number;
  model?: string;
  timeoutMs?: number;
  keepWorkspace?: boolean;
  artifactRoot?: string;
  skillctlVersion: string;
  lockfileEntry?: unknown;
  projectRoot?: string;
}

export async function runSkillTests(testFile: SkillTestFile, options: RunSkillTestsOptions): Promise<SkillTestResult> {
  const runs = options.runs ?? 3;
  if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error('--runs must be an integer between 1 and 20');
  const parsedSkill = await parseSkillDirectory(options.skillPath);
  if (canonicalizeName(testFile.skill) !== parsedSkill.name) throw new Error(`Test YAML skill ${testFile.skill} does not match executed skill ${parsedSkill.name}`);
  for (const testCase of testFile.cases) {
    if (testCase.runner?.id && testCase.runner.id !== options.runner.id) throw new Error(`Case ${testCase.name} requires runner ${testCase.runner.id}, not ${options.runner.id}`);
  }
  const testIntegrity = await computeTestIntegrity(options.testFilePath, testFile);
  const modelSeed = options.model || testFile.cases.map((testCase) => testCase.runner?.model || 'runner-default').join(',');
  const seed = options.seed ?? stableSeed(`${testIntegrity}\0${parsedSkill.integrity}\0${options.runner.id}\0${modelSeed}\0${runs}`);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const detection = await options.runner.detect();
  if (!detection.available) throw new Error(detection.reason || `Runner ${options.runner.id} is unavailable`);
  const policies = testFile.cases.map((testCase) => testCase.network || { mode: 'deny' as const, webSearch: 'disabled' as const });
  await options.runner.preflight?.([...new Map(policies.map((policy) => [`${policy.mode}:${policy.webSearch}`, policy])).values()]);
  const auth = resolveCodexAuth();
  const caseResults: CaseResult[] = [];
  const allBaseline: VariantResult[] = [];
  const allSkill: VariantResult[] = [];
  const resolvedModels = new Set<string>();

  for (let caseIndex = 0; caseIndex < testFile.cases.length; caseIndex++) {
    const testCase = testFile.cases[caseIndex];
    const pairs: CaseResult['pairs'] = [];
    const fixture = testCase.fixture
      ? await resolveFixturePath(options.testFilePath, testCase.fixture, options.projectRoot)
      : undefined;
    for (let run = 0; run < runs; run++) {
      const first: 'baseline' | 'skill' = ((seed + caseIndex + run) % 2 === 0) ? 'baseline' : 'skill';
      const results = new Map<'baseline' | 'skill', VariantResult>();
      for (const variant of [first, first === 'baseline' ? 'skill' : 'baseline'] as const) {
        const isolation = await createIsolation(fixture);
        try {
          if (variant === 'skill') await installTestSkill(isolation.workspace, options.skillPath, parsedSkill.name);
          const initialFiles = await snapshotWorkspace(isolation.workspace);
          const requestedModel = options.model || testCase.runner?.model;
          const network = testCase.network || { mode: 'deny', webSearch: 'disabled' };
          const agent = await options.runner.run({
            prompt: testCase.prompt,
            workspace: isolation.workspace,
            isolationRoot: isolation.root,
            timeoutMs: testCase.timeout || options.timeoutMs || 120_000,
            network,
            requestedModel,
            auth,
          });
          if (agent.resolvedModel) resolvedModels.add(agent.resolvedModel);
          const assertions = agent.ok
            ? await evaluateAssertions(testCase.assertions, isolation.workspace, initialFiles, { timeoutMs: testCase.timeout || 30_000, environment: isolatedEnvironment(isolation) })
            : [];
          const finalFiles = await snapshotWorkspace(isolation.workspace);
          const changedFiles = countSnapshotChanges(initialFiles, finalFiles);
          const requiredPass = testCase.assertions.every((assertion, index) => assertion.required === false || assertions[index]?.passed);
          const budgetPass = (testCase.budget?.maxDurationMs === undefined || agent.durationMs <= testCase.budget.maxDurationMs)
            && (testCase.budget?.maxTokens === undefined || (agent.tokens !== undefined && agent.tokens <= testCase.budget.maxTokens))
            && (testCase.budget?.maxChangedFiles === undefined || changedFiles <= testCase.budget.maxChangedFiles);
          let kept: string | undefined;
          if (options.keepWorkspace) {
            const root = options.artifactRoot || resolve(process.cwd(), '.skillctl', 'artifacts', 'test', 'workspaces');
            kept = join(root, runId, safe(`${testCase.name}-${run}-${variant}`));
            await mkdir(dirname(kept), { recursive: true });
            await cp(isolation.workspace, kept, { recursive: true, force: false, errorOnExist: true });
          }
          const result: VariantResult = {
            variant, run, passed: agent.ok && requiredPass && budgetPass, assertions,
            durationMs: agent.durationMs, tokens: agent.tokens, tokenUsage: agent.tokenUsage, requestedModel: agent.requestedModel,
            resolvedModel: agent.resolvedModel, network, runnerError: agent.error, timedOut: agent.timedOut,
            runnerIncomplete: agent.incomplete, workspace: kept,
          };
          results.set(variant, result);
        } finally {
          await destroyIsolation(isolation);
        }
      }
      const baseline = results.get('baseline')!;
      const skill = results.get('skill')!;
      allBaseline.push(baseline);
      allSkill.push(skill);
      pairs.push({ run, first, baseline, skill });
    }
    const baselinePassRate = passRate(pairs.map((pair) => pair.baseline));
    const skillPassRate = passRate(pairs.map((pair) => pair.skill));
    const invalid = pairs.some((pair) => pair.baseline.timedOut || pair.skill.timedOut || pair.baseline.runnerError || pair.skill.runnerError || pair.baseline.runnerIncomplete || pair.skill.runnerIncomplete);
    caseResults.push({
      name: testCase.name,
      prompt: testCase.prompt,
      fixture: testCase.fixture,
      budget: testCase.budget,
      timeout: testCase.timeout,
      network: testCase.network || { mode: 'deny', webSearch: 'disabled' },
      baselinePassRate,
      skillPassRate,
      pairs,
      verdict: caseVerdict(pairs, invalid),
    });
  }

  const baselinePassRate = passRate(allBaseline);
  const skillPassRate = passRate(allSkill);
  const configuredModels = new Set(testFile.cases.map((testCase) => testCase.runner?.model).filter((model): model is string => Boolean(model)));
  const everyCasePinned = testFile.cases.every((testCase) => Boolean(options.model || testCase.runner?.model));
  const requestedModel = options.model || (configuredModels.size === 1 && everyCasePinned ? [...configuredModels][0] : null);
  return {
    schemaVersion: 1,
    skill: testFile.skill,
    skillMetadata: { path: options.skillPath, integrity: parsedSkill.integrity, lockfileEntry: options.lockfileEntry },
    skillctlVersion: options.skillctlVersion,
    runner: options.runner.id,
    runnerDetection: detection,
    seed,
    runId,
    testIntegrity,
    runs,
    requestedModel,
    resolvedModels: [...resolvedModels].sort(),
    warning: requestedModel ? undefined : 'No model was pinned; results are paired within this run but are not stably comparable across dates or environments.',
    verdict: skillVerdict(caseResults, baselinePassRate, skillPassRate),
    baselinePassRate,
    skillPassRate,
    cases: caseResults,
    createdAt: new Date().toISOString(),
  };
}

function passRate(results: VariantResult[]): number { return results.length ? results.filter((item) => item.passed).length / results.length : 0; }
function stableSeed(value: string): number { return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16); }
function safe(value: string): string { return value.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 100); }
async function computeTestIntegrity(path: string, testFile: SkillTestFile): Promise<string> {
  return computeFileHash(path).catch(async () => `sha256:${createHash('sha256').update(await readFile(path).catch(() => Buffer.from(JSON.stringify(testFile)))).digest('hex')}`);
}
