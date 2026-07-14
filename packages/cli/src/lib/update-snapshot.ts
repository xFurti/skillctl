import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface UpdateSnapshot {
  root: string;
  cwd: string;
  store: string;
  names: string[];
  manifest: Buffer | null;
  lock: Buffer | null;
  existing: Set<string>;
}

export async function createUpdateSnapshot(cwd: string, store: string, names: string[]): Promise<UpdateSnapshot> {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-update-rollback-'));
  const existing = new Set<string>();
  for (const name of names) {
    const source = join(store, name);
    if (await stat(source).catch(() => null)) {
      existing.add(name);
      await cp(source, join(root, name), { recursive: true, force: true });
    }
  }
  return {
    root, cwd, store, names, existing,
    manifest: await readFile(join(cwd, 'agent-skills.json')).catch(() => null),
    lock: await readFile(join(cwd, 'agent-skills.lock')).catch(() => null),
  };
}

export async function restoreUpdateSnapshot(snapshot: UpdateSnapshot): Promise<void> {
  for (const name of snapshot.names) {
    const target = join(snapshot.store, name);
    await rm(target, { recursive: true, force: true });
    if (snapshot.existing.has(name)) await cp(join(snapshot.root, name), target, { recursive: true, force: true });
  }
  await restoreFile(join(snapshot.cwd, 'agent-skills.json'), snapshot.manifest);
  await restoreFile(join(snapshot.cwd, 'agent-skills.lock'), snapshot.lock);
  await disposeUpdateSnapshot(snapshot);
}

export async function disposeUpdateSnapshot(snapshot: UpdateSnapshot): Promise<void> {
  await rm(snapshot.root, { recursive: true, force: true });
}

async function restoreFile(path: string, content: Buffer | null): Promise<void> {
  if (content) await writeFile(path, content);
  else await rm(path, { force: true });
}
