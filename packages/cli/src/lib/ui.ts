export interface HumanSummary {
  label: string;
  counts?: Record<string, number>;
  message?: string;
}

export function renderSummary(summary: HumanSummary): string {
  const counts = Object.entries(summary.counts || {}).map(([name, count]) => `${count} ${name}`).join(', ');
  return [summary.label, counts, summary.message].filter(Boolean).join(': ');
}

export function supportsInteractiveUi(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);
}

export function useUnicode(): boolean {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return false;
  return process.platform !== 'win32' || /utf-?8/i.test(process.env.LANG || '') || Boolean(process.env.WT_SESSION);
}
