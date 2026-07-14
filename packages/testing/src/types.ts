export type AssertionType = 'file-exists' | 'file-not-exists' | 'file-contains' | 'file-not-contains' | 'regex' | 'command' | 'json-schema' | 'snapshot' | 'forbidden-path' | 'max-changed-files';
export type CaseVerdict = 'improved' | 'unchanged' | 'regressed' | 'inconclusive';
export type SkillVerdict = CaseVerdict;

export interface RunnerDetection {
  available: boolean;
  version?: string;
  capabilities: string[];
  reason?: string;
}

export interface NetworkPolicy {
  mode: 'deny' | 'allow';
  webSearch: 'disabled' | 'cached' | 'live';
}

export interface TestAssertion {
  type: AssertionType;
  path?: string;
  contains?: string;
  pattern?: string;
  executable?: string;
  argv?: string[];
  cwd?: string;
  schema?: Record<string, unknown>;
  snapshot?: string;
  max?: number;
  required?: boolean;
}

export interface SkillTestCase {
  name: string;
  prompt: string;
  fixture?: string;
  assertions: TestAssertion[];
  budget?: { maxDurationMs?: number; maxTokens?: number; maxChangedFiles?: number };
  timeout?: number;
  network?: NetworkPolicy;
  runner?: { id?: string; model?: string };
}

export interface SkillTestFile {
  version: 1;
  skill: string;
  cases: SkillTestCase[];
}

export interface AgentRunRequest {
  prompt: string;
  workspace: string;
  isolationRoot: string;
  timeoutMs: number;
  network: NetworkPolicy;
  requestedModel?: string;
  auth: { apiKey: string };
}

export interface AgentRunResult {
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  tokens?: number;
  tokenUsage?: { input: number; cachedInput: number; output: number; reasoning: number; total: number };
  requestedModel: string | null;
  resolvedModel?: string;
  output: string;
  error?: string;
  timedOut?: boolean;
  incomplete?: boolean;
  outputTruncated?: boolean;
}

export interface AgentRunner {
  readonly id: string;
  detect(): Promise<RunnerDetection>;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

export interface AssertionResult {
  assertion: TestAssertion;
  passed: boolean;
  message: string;
}

export interface VariantResult {
  variant: 'baseline' | 'skill';
  run: number;
  passed: boolean;
  assertions: AssertionResult[];
  durationMs: number;
  tokens?: number;
  tokenUsage?: AgentRunResult['tokenUsage'];
  requestedModel: string | null;
  resolvedModel?: string;
  network: NetworkPolicy;
  runnerError?: string;
  timedOut?: boolean;
  runnerIncomplete?: boolean;
  workspace?: string;
}

export interface CaseResult {
  name: string;
  prompt: string;
  fixture?: string;
  budget?: SkillTestCase['budget'];
  timeout?: number;
  network: NetworkPolicy;
  verdict: CaseVerdict;
  baselinePassRate: number;
  skillPassRate: number;
  pairs: Array<{ run: number; first: 'baseline' | 'skill'; baseline: VariantResult; skill: VariantResult }>;
}

export interface SkillTestResult {
  schemaVersion: 1;
  skill: string;
  skillMetadata: { path: string; integrity: string; lockfileEntry?: unknown };
  skillctlVersion: string;
  runner: string;
  runnerDetection: RunnerDetection;
  seed: number;
  runId: string;
  testIntegrity: string;
  runs: number;
  requestedModel: string | null;
  resolvedModels: string[];
  warning?: string;
  verdict: SkillVerdict;
  baselinePassRate: number;
  skillPassRate: number;
  cases: CaseResult[];
  createdAt: string;
}
