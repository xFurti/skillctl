export type AuditSeverity = 'info' | 'warning' | 'error';
export type AuditCategory = 'integrity' | 'provenance' | 'filesystem' | 'execution' | 'network' | 'secrets' | 'prompt-injection' | 'policy' | 'plugin' | 'managed-target';

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
  category?: AuditCategory;
  remediation?: string;
  confidence?: 'low' | 'medium' | 'high';
  evidence?: string[];
}

export interface AuditReport {
  status: 'ok' | 'warnings' | 'errors';
  findings: AuditFinding[];
  scanned: number;
}
