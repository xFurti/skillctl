import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { StreamingSecretRedactor } from '@skillctl/core';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  truncated: boolean;
}

export async function runProcess(
  command: string,
  args: string[],
  options: {
    timeoutMs: number;
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    input?: string;
    maxOutputBytes?: number;
    knownSecrets?: Record<string, string | undefined>;
  },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let rawBytes = 0;
    let limitTerminationRequested = false;
    const limit = options.maxOutputBytes ?? 2 * 1024 * 1024;
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    const stdoutRedactor = new StreamingSecretRedactor(options.knownSecrets, Math.max(limit, 96));
    const stderrRedactor = new StreamingSecretRedactor(options.knownSecrets, Math.max(limit, 96));
    const append = (current: string, value: string): string => {
      const combined = current + value;
      if (Buffer.byteLength(combined) <= limit) return combined;
      truncated = true;
      return combined.slice(-limit);
    };
    const consume = (chunk: Buffer, decoder: StringDecoder, redactor: StreamingSecretRedactor, stream: 'stdout' | 'stderr'): void => {
      if (limitTerminationRequested) return;
      const remaining = Math.max(0, limit - rawBytes);
      const accepted = chunk.subarray(0, remaining);
      rawBytes += accepted.byteLength;
      const redacted = redactor.write(decoder.write(accepted));
      if (stream === 'stdout') stdout = append(stdout, redacted);
      else stderr = append(stderr, redacted);
      if (accepted.byteLength < chunk.byteLength) {
        truncated = true;
        limitTerminationRequested = true;
        terminateProcessTree(child.pid);
      }
    };
    child.stdout.on('data', (chunk: Buffer) => { consume(chunk, stdoutDecoder, stdoutRedactor, 'stdout'); });
    child.stderr.on('data', (chunk: Buffer) => { consume(chunk, stderrDecoder, stderrRedactor, 'stderr'); });
    child.on('error', reject);
    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child.pid);
    }, options.timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      stdout = append(stdout, stdoutRedactor.write(stdoutDecoder.end()));
      stdout = append(stdout, stdoutRedactor.end());
      stderr = append(stderr, stderrRedactor.write(stderrDecoder.end()));
      stderr = append(stderr, stderrRedactor.end());
      resolve({ stdout, stderr, code, timedOut, truncated });
    });
  });
}

export function terminateProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.unref();
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); }
  catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already exited */ }
  }
}
