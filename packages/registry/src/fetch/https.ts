import https from 'node:https';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function skillctlUserAgent(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version?: string };
    if (pkg.version) return `skillctl/${pkg.version}`;
  } catch {
    // fallback if package.json unavailable at runtime
  }
  return 'skillctl/0.4.0';
}

const MAX_REDIRECTS = 5;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

export function httpsGet(
  url: string,
  headers: Record<string, string> = {},
  redirectsLeft = MAX_REDIRECTS
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      reject(new Error(`Refusing non-HTTPS download: ${url}`));
      return;
    }

    const req = https.get(parsed, { headers: { 'User-Agent': skillctlUserAgent(), ...headers } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        const next = new URL(res.headers.location, parsed).toString();
        httpsGet(next, headers, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) {
          res.destroy(new Error(`Download exceeds ${MAX_DOWNLOAD_BYTES} bytes: ${url}`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}
