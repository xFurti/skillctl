export interface RedactionSummary {
  total: number;
  types: Record<string, number>;
}

export interface RedactionResult<T> {
  value: T;
  redactions: RedactionSummary;
}

const MIN_SECRET_LENGTH = 12;
const SENSITIVE_FIELD = /(?:api[_-]?key|access[_-]?token|auth(?:orization)?|password|passwd|secret|credential|cookie)/i;
const SAFE_FIELD = /^(?:hash|integrity|version|id|fingerprint|commit|sha|resolved)$/i;
const TOKEN_PATTERNS: Array<[string, RegExp]> = [
  ['openai-api-key', /\bsk-[A-Za-z0-9_-]{16,}\b/g],
  ['github-token', /\bgh[opusr]_[A-Za-z0-9]{20,}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['authorization', /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/gi],
];

export function redactSecrets<T>(value: T, knownSecrets: Record<string, string | undefined> = {}): RedactionResult<T> {
  const summary: RedactionSummary = { total: 0, types: {} };
  const secrets = Object.entries(knownSecrets)
    .filter(([, secret]) => isUsefulSecret(secret))
    .map(([type, secret]) => [type, secret!] as const);

  function record(type: string): string {
    summary.total++;
    summary.types[type] = (summary.types[type] || 0) + 1;
    return `[REDACTED:${type}]`;
  }

  function text(input: string, field?: string): string {
    let output = input;
    for (const [type, secret] of secrets) {
      output = replaceExact(output, secret, () => record(normalizeType(type)));
    }
    if (field && SAFE_FIELD.test(field)) return output;
    if (field && SENSITIVE_FIELD.test(field) && output === input && isUsefulSecret(input)) return record(normalizeType(field));
    for (const [type, pattern] of TOKEN_PATTERNS) output = output.replace(pattern, () => record(type));
    return output;
  }

  function visit(input: unknown, field?: string): unknown {
    if (typeof input === 'string') return text(input, field);
    if (Array.isArray(input)) return input.map((item) => visit(item));
    if (input && typeof input === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(input)) output[key] = visit(item, key);
      return output;
    }
    return input;
  }

  return { value: visit(value) as T, redactions: summary };
}

export class StreamingSecretRedactor {
  private pending = '';
  private readonly overlap: number;

  constructor(
    private readonly knownSecrets: Record<string, string | undefined> = {},
    private readonly maxPendingLength = 2 * 1024 * 1024,
  ) {
    this.overlap = Math.max(96, ...Object.values(knownSecrets).map((value) => value?.length || 0));
    if (maxPendingLength < this.overlap) throw new Error('Streaming redaction limit must cover the secret overlap');
  }

  write(chunk: string): string {
    const combined = this.pending + chunk;
    if (combined.length <= this.overlap) {
      this.pending = combined;
      return '';
    }
    const boundary = combined.length - this.overlap;
    const newlineBoundary = combined.lastIndexOf('\n', boundary) + 1;
    let safeBoundary = newlineBoundary > 0 ? newlineBoundary : boundary;
    for (const secret of Object.values(this.knownSecrets).filter(isUsefulSecret)) {
      let start = combined.indexOf(secret);
      while (start >= 0) {
        if (start < safeBoundary && start + secret.length > safeBoundary) safeBoundary = start;
        start = combined.indexOf(secret, start + 1);
      }
    }
    const privateKeyStart = combined.lastIndexOf('-----BEGIN ', safeBoundary);
    const privateKeyEnd = combined.lastIndexOf('-----END ', safeBoundary);
    if (privateKeyStart > privateKeyEnd) safeBoundary = privateKeyStart;
    if (safeBoundary <= 0 && combined.length > this.maxPendingLength) {
      throw new Error('Streaming redaction buffer exceeded its configured limit');
    }
    this.pending = combined.slice(safeBoundary);
    return redactSecrets(combined.slice(0, safeBoundary), this.knownSecrets).value;
  }

  end(): string {
    const output = redactSecrets(this.pending, this.knownSecrets).value;
    this.pending = '';
    return output;
  }
}

function isUsefulSecret(value: string | undefined): value is string {
  return Boolean(value && value.length >= MIN_SECRET_LENGTH && !/^(?:true|false|null|undefined|password|changeme|localhost)$/i.test(value));
}

function replaceExact(input: string, secret: string, replacement: () => string): string {
  let cursor = 0;
  let output = '';
  while (true) {
    const index = input.indexOf(secret, cursor);
    if (index < 0) return output + input.slice(cursor);
    output += input.slice(cursor, index) + replacement();
    cursor = index + secret.length;
  }
}

function normalizeType(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'secret';
}
