import { createHash } from 'node:crypto';
import type { AuditFinding, AuditReport } from './types.js';

export function auditReportToSarif(report: AuditReport): Record<string, unknown> {
  const rules = [...new Map(report.findings.map((finding) => [finding.rule, {
    id: finding.rule,
    shortDescription: { text: finding.description || finding.rule },
    helpUri: finding.helpUri,
  }])).values()];
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'skillctl', informationUri: 'https://xfurti.github.io/skillctl/', rules } },
      results: report.findings.map(sarifResult),
    }],
  };
}

function sarifResult(finding: AuditFinding): Record<string, unknown> {
  const path = finding.location?.path || finding.path;
  const fingerprint = finding.fingerprint || createHash('sha256')
    .update(`${finding.rule}\0${finding.skill}\0${path || ''}\0${finding.message}`)
    .digest('hex');
  return {
    ruleId: finding.rule,
    level: finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'note',
    message: { text: `${finding.skill}: ${finding.message}` },
    locations: path ? [{ physicalLocation: {
      artifactLocation: { uri: path.replaceAll('\\', '/') },
      region: finding.location?.startLine ? { startLine: finding.location.startLine, endLine: finding.location.endLine || finding.location.startLine } : undefined,
    } }] : undefined,
    partialFingerprints: { primaryLocationLineHash: fingerprint },
  };
}
