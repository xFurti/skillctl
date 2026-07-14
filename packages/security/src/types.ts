export type AuditSeverity = 'info' | 'warning' | 'error';

export interface AuditFinding {
  rule: string;
  severity: AuditSeverity;
  skill: string;
  message: string;
  path?: string;
  description?: string;
  helpUri?: string;
  location?: { path: string; startLine?: number; endLine?: number };
  fingerprint?: string;
}

export interface AuditReport {
  status: 'ok' | 'warnings' | 'errors';
  findings: AuditFinding[];
  scanned: number;
}
