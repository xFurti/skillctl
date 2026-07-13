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

export async function choose(message: string, choices: string[]): Promise<number> {
  if (!isInteractive()) throw new Error(`${message}: interactive terminal required`);
  const rl = createInterface({ input, output });
  console.log(message);
  choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice}`));
  const answer = (await rl.question('Choose a number: ')).trim();
  rl.close();
  const index = Number.parseInt(answer, 10) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
    throw new Error(`Invalid selection: ${answer}`);
  }
  return index;
}
