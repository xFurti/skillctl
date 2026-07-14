const MIN_SECRET_LENGTH = 12;
const SENSITIVE_FIELD = /(?:api[_-]?key|access[_-]?token|auth(?:orization)?|password|passwd|secret|credential|cookie)/i;
const SAFE_FIELD = /^(?:hash|integrity|version|id|fingerprint|commit|sha|resolved)$/i;
const TOKEN_PATTERNS = [
  ['openai-api-key', /\bsk-[A-Za-z0-9_-]{16,}\b/g],
  ['github-token', /\bgh[opusr]_[A-Za-z0-9]{20,}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['authorization', /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/gi],
] as const;

export function redactSecrets<T>(value: T, knownSecrets: Record<string, string | undefined> = {}): { value: T } {
  const secrets = Object.entries(knownSecrets)
    .filter((entry): entry is [string, string] => useful(entry[1]));

  function text(input: string, field?: string): string {
    if (field && SAFE_FIELD.test(field)) return input;
    if (field && SENSITIVE_FIELD.test(field) && useful(input)) return `[REDACTED:${normalize(field)}]`;
    let output = input;
    for (const [type, secret] of secrets) output = replaceBounded(output, secret, `[REDACTED:${normalize(type)}]`);
    for (const [type, pattern] of TOKEN_PATTERNS) output = output.replace(pattern, `[REDACTED:${type}]`);
    return output;
  }

  function visit(input: unknown, field?: string): unknown {
    if (typeof input === 'string') return text(input, field);
    if (Array.isArray(input)) return input.map((item) => visit(item));
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, visit(item, key)]));
    return input;
  }

  return { value: visit(value) as T };
}

function useful(value: string | undefined): value is string {
  return Boolean(value && value.length >= MIN_SECRET_LENGTH && !/^(?:true|false|null|undefined|password|changeme|localhost)$/i.test(value));
}

function replaceBounded(input: string, secret: string, replacement: string): string {
  let cursor = 0;
  let output = '';
  while (true) {
    const index = input.indexOf(secret, cursor);
    if (index < 0) return output + input.slice(cursor);
    const before = input[index - 1];
    const after = input[index + secret.length];
    output += input.slice(cursor, index);
    output += (before && /[A-Za-z0-9]/.test(before)) || (after && /[A-Za-z0-9]/.test(after))
      ? secret
      : replacement;
    cursor = index + secret.length;
  }
}

function normalize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'secret';
}
