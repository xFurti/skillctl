import { readFile, readdir } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import type { AuditCategory, AuditFinding, AuditSeverity } from '../types.js';

interface Heuristic {
  rule: string;
  category: AuditCategory;
  pattern: RegExp;
  severity: AuditSeverity;
  confidence: 'low' | 'medium' | 'high';
  message: string;
  remediation: string;
}

const HEURISTICS: Heuristic[] = [
  { rule: 'embedded-secret', category: 'secrets', pattern: /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,})/i, severity: 'error', confidence: 'high', message: 'Possible embedded credential or private key.', remediation: 'Remove the credential, rotate it, and load secrets from an approved runtime secret store.' },
  { rule: 'destructive-command', category: 'execution', pattern: /(?:\brm\s+-rf\b|\bRemove-Item\b[^\n]*-Recurse|\bformat\s+[A-Z]:)/i, severity: 'warning', confidence: 'high', message: 'Potentially destructive command detected.', remediation: 'Constrain the command to an explicit workspace path and require user confirmation.' },
  { rule: 'download-pipe-shell', category: 'execution', pattern: /(?:curl|wget|Invoke-WebRequest)[^\n|;]*(?:\||;)\s*(?:sh|bash|powershell|pwsh|node|python)\b/i, severity: 'error', confidence: 'high', message: 'Downloaded content may be executed directly.', remediation: 'Download to staging, verify integrity and provenance, then execute only after review.' },
  { rule: 'sensitive-path', category: 'filesystem', pattern: /(?:~\/\.ssh|\/etc\/(?:shadow|passwd)|\.aws\/credentials|AppData[\\/]Roaming)/i, severity: 'warning', confidence: 'medium', message: 'The skill references a sensitive user or system path.', remediation: 'Remove the access or document and narrowly scope the required path.' },
  { rule: 'global-config-change', category: 'policy', pattern: /(?:git\s+config\s+--global|npm\s+config\s+set|Set-ExecutionPolicy|\.bashrc|\.zshrc|\$PROFILE)/i, severity: 'warning', confidence: 'medium', message: 'The skill may modify global user configuration.', remediation: 'Prefer project-local configuration and ask for explicit consent before global changes.' },
  { rule: 'network-access', category: 'network', pattern: /(?:https?:\/\/|\bcurl\b|\bwget\b|Invoke-WebRequest|\bfetch\s*\()/i, severity: 'info', confidence: 'medium', message: 'The skill appears to access the network.', remediation: 'Document required hosts, data sent, and an offline alternative where possible.' },
  { rule: 'prompt-injection', category: 'prompt-injection', pattern: /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|higher|system|developer)\s+(?:instructions|rules|policy)/i, severity: 'warning', confidence: 'medium', message: 'Possible instruction to override higher-priority policy.', remediation: 'Remove policy-override language and express the intended task within normal instruction hierarchy.' },
  { rule: 'behavior-description-mismatch', category: 'prompt-injection', pattern: /(?:do not (?:tell|show|mention)|hide (?:this|the)|secretly|without (?:the )?user(?:'s)? knowledge)/i, severity: 'info', confidence: 'low', message: 'The described behavior may be broader or less transparent than the skill summary.', remediation: 'Make the description explicit about side effects and user-visible behavior.' },
];

export async function checkAdvancedContent(skill: string, root: string): Promise<AuditFinding[]> {
  const files: string[] = [];
  await walk(root, files);
  const findings: AuditFinding[] = [];
  for (const path of files) {
    const rel = relative(root, path).replaceAll('\\', '/');
    const fileName = basename(path).toLowerCase();
    if (fileName === '.env' || /(?:id_rsa|id_ed25519|credentials|\.pem|\.key)$/.test(fileName)) {
      findings.push({ rule: 'sensitive-file', category: 'secrets', severity: 'error', confidence: 'high', skill, message: 'Sensitive credential file name detected.', path, evidence: [`file:${rel}`], remediation: 'Remove the file, rotate any exposed credential, and reference a runtime secret store instead.' });
    }
    const content = await readFile(path, 'utf8').catch(() => null);
    if (content == null) continue;
    for (const heuristic of HEURISTICS) {
      const match = heuristic.pattern.exec(content);
      if (!match) continue;
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push({
        rule: heuristic.rule,
        category: heuristic.category,
        severity: heuristic.severity,
        confidence: heuristic.confidence,
        skill,
        message: heuristic.message,
        path,
        location: { path, startLine: line },
        evidence: [`file:${rel}`, `line:${line}`, `signal:${heuristic.rule}`],
        remediation: heuristic.remediation,
      });
    }
  }
  return findings;
}

async function walk(dir: string, files: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else if (entry.isFile() && /(?:^SKILL\.md$|\.(?:md|txt|sh|bash|ps1|py|js|ts|mjs|cjs|json|ya?ml|env|key|pem))$/i.test(entry.name)) files.push(path);
  }
}
