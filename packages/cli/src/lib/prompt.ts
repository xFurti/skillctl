import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export function isInteractive(): boolean {
  return Boolean(input.isTTY && output.isTTY);
}

export async function confirm(message: string, defaultYes = true): Promise<boolean> {
  if (!isInteractive()) return false;
  const rl = createInterface({ input, output });
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await rl.question(`${message} ${suffix} `)).trim().toLowerCase();
  rl.close();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}
