export class SkillctlError extends Error {
  constructor(
    message: string,
    readonly code = 'SKILLCTL_ERROR',
    readonly exitCode: 1 | 2 = 2,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'SkillctlError';
  }
}

export function handleCommandError(err: unknown, label: string): void {
  const message = err instanceof Error ? err.message : String(err);
  addCliIssue('error', {
    code: err instanceof SkillctlError ? err.code : 'COMMAND_ERROR',
    message: `${label} failed: ${message}`,
    details: err instanceof SkillctlError ? err.details : undefined,
  });
  process.exitCode = err instanceof SkillctlError ? err.exitCode : 2;
}
import { addCliIssue } from './output.js';
