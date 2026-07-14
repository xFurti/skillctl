import type { CaseResult, CaseVerdict, SkillVerdict } from './types.js';

export function caseVerdict(pairs: CaseResult['pairs'], invalid: boolean): CaseVerdict {
  if (invalid || !pairs.length) return 'inconclusive';
  const failToPass = pairs.filter((pair) => !pair.baseline.passed && pair.skill.passed).length;
  const passToFail = pairs.filter((pair) => pair.baseline.passed && !pair.skill.passed).length;
  if (failToPass && passToFail) return 'inconclusive';
  if (failToPass >= 2 && passToFail === 0) return 'improved';
  if (passToFail >= 2 && failToPass === 0) return 'regressed';
  if (failToPass || passToFail) return 'inconclusive';
  return 'unchanged';
}

export function skillVerdict(cases: CaseResult[], baselinePassRate: number, skillPassRate: number): SkillVerdict {
  if (!cases.length || cases.some((item) => item.verdict === 'inconclusive')) return 'inconclusive';
  const improved = cases.some((item) => item.verdict === 'improved');
  const regressed = cases.some((item) => item.verdict === 'regressed');
  if (improved && regressed) return 'inconclusive';
  if (improved && !regressed && skillPassRate > baselinePassRate) return 'improved';
  if (regressed && !improved && skillPassRate < baselinePassRate) return 'regressed';
  if (cases.every((item) => item.verdict === 'unchanged')) return 'unchanged';
  return 'inconclusive';
}
