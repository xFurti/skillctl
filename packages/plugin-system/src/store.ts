import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, realpath, readlink, rm, stat, writeFile } from 'node:fs/promises';
import https from 'node:https';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import semver from 'semver';
import * as tar from 'tar';
import { computeDirIntegrity, loadConfig, resolvePathInside, writeFileAtomic } from '@skillctl/core';
import type { PluginInspection, PluginLockEntry, PluginManifestEntry } from './types.js';

interface PluginManifestFile { version: 1; plugins: Record<string, PluginManifestEntry> }
interface PluginLockFile { version: 1; plugins: Record<string, PluginLockEntry> }

const root = join(homedir(), '.skillctl');
const manifestPath = join(root, 'plugins.json');
const lockPath = join(root, 'plugins.lock');
const pluginsDir = join(root, 'plugins');

export function getPluginsDir(): string { return pluginsDir; }
export function getPluginManifestPath(): string { return manifestPath; }
export function getPluginLockPath(): string { return lockPath; }

export async function loadPluginManifest(options: { migrateLegacy?: boolean } = {}): Promise<PluginManifestFile> {
  const manifest = await readJson<PluginManifestFile>(manifestPath, { version: 1, plugins: {} });
  if (options.migrateLegacy) await migrateLegacy(manifest);
  return manifest;
}

export async function loadPluginLock(): Promise<PluginLockFile> {
  return readJson(lockPath, { version: 1, plugins: {} });
}

export async function addPlugin(specifier: string, options: { allowLocal?: boolean } = {}): Promise<PluginLockEntry> {
  const prepared = specifier.startsWith('npm:')
    ? await prepareNpmPlugin(specifier)
    : await prepareLocalPlugin(specifier, options.allowLocal === true);
  const manifest = await loadPluginManifest({ migrateLegacy: true });
  const lock = await loadPluginLock();
  manifest.plugins[prepared.name] = { specifier, enabled: true, allowLocal: options.allowLocal };
  lock.plugins[prepared.name] = prepared;
  await saveJson(manifestPath, manifest);
  await saveJson(lockPath, lock);
  return prepared;
}

export async function inspectPluginSpecifier(specifier: string, options: { allowLocal?: boolean } = {}): Promise<PluginInspection> {
  if (!specifier.startsWith('npm:')) {
    if (!options.allowLocal) throw new Error('Local plugins require --allow-local because they execute arbitrary code');
    const path = resolve(process.cwd(), specifier.replace(/^file:/, ''));
    const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    const lock = await inspectPlugin(path, specifier, `file:${path}`);
    return inspectionFromPackage(lock, pkg, { requested: specifier, trusted: false, trustReason: 'local plugins are untrusted by default' });
  }
  const { packageName, range } = parseNpmSpecifier(specifier);
  const metadata = JSON.parse((await download(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, 5, 10 * 1024 * 1024)).toString('utf8'));
  const version = metadata['dist-tags']?.[range] || semver.maxSatisfying(Object.keys(metadata.versions || {}), range);
  if (!version || !metadata.versions?.[version]) throw new Error(`No npm plugin version satisfies ${range}`);
  const info = metadata.versions[version];
  const buffer = await download(info.dist.tarball);
  verifySri(buffer, info.dist.integrity || info.dist.shasum);
  const temporary = join(tmpdir(), `skillctl-plugin-inspect-${randomUUID()}`);
  const archive = `${temporary}.tgz`;
  try {
    await mkdir(temporary, { recursive: true });
    await writeFile(archive, buffer);
    await tar.x({ cwd: temporary, file: archive, strip: 1, preservePaths: false });
    await assertPluginTreeContained(temporary);
    const lock = await inspectPlugin(temporary, specifier, `npm:${packageName}@${version}`);
    const config = await loadConfig();
    const trusted = (config.trustedSources || []).some((pattern) => globMatch(pattern, specifier) || globMatch(pattern, `npm:${packageName}@${version}`));
    return inspectionFromPackage(lock, info, {
      requested: specifier,
      trusted,
      trustReason: trusted ? 'matched trustedSources' : 'source does not match trustedSources',
      publisher: info._npmUser,
      tarballUrl: info.dist.tarball,
      tarballIntegrity: info.dist.integrity || info.dist.shasum,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(archive, { force: true });
  }
}

export async function installPlugins(): Promise<PluginLockEntry[]> {
  const manifest = await loadPluginManifest({ migrateLegacy: true });
  const installed: PluginLockEntry[] = [];
  for (const entry of Object.values(manifest.plugins)) installed.push(await addPlugin(entry.specifier, { allowLocal: entry.allowLocal }));
  return installed;
}

export async function setPluginEnabled(name: string, enabled: boolean): Promise<boolean> {
  const manifest = await loadPluginManifest({ migrateLegacy: true });
  if (!manifest.plugins[name]) return false;
  manifest.plugins[name].enabled = enabled;
  await saveJson(manifestPath, manifest);
  return true;
}

export async function removePlugin(name: string): Promise<boolean> {
  const manifest = await loadPluginManifest({ migrateLegacy: true });
  const lock = await loadPluginLock();
  if (!manifest.plugins[name] && !lock.plugins[name]) return false;
  const path = lock.plugins[name]?.path;
  delete manifest.plugins[name];
  delete lock.plugins[name];
  await saveJson(manifestPath, manifest);
  await saveJson(lockPath, lock);
  if (path?.startsWith(pluginsDir)) await rm(dirname(path), { recursive: true, force: true });
  return true;
}

export async function pluginDiagnostics(): Promise<Array<{ name: string; ok: boolean; message: string }>> {
  const manifest = await loadPluginManifest({ migrateLegacy: true });
  const lock = await loadPluginLock();
  const diagnostics = [];
  for (const [name, requested] of Object.entries(manifest.plugins)) {
    const entry = lock.plugins[name];
    if (!entry) { diagnostics.push({ name, ok: false, message: 'missing lock entry' }); continue; }
    const integrity = await computeDirIntegrity(entry.path).catch(() => 'missing');
    diagnostics.push({
      name,
      ok: integrity === entry.integrity && entry.apiVersion === 1,
      message: integrity !== entry.integrity ? 'integrity mismatch' : entry.apiVersion !== 1 ? `unsupported API ${entry.apiVersion}` : requested.enabled ? 'enabled' : 'disabled',
    });
  }
  return diagnostics;
}

async function prepareLocalPlugin(specifier: string, allowed: boolean): Promise<PluginLockEntry> {
  if (!allowed) throw new Error('Local plugins require --allow-local because they execute arbitrary code');
  const path = resolve(process.cwd(), specifier.replace(/^file:/, ''));
  return inspectPlugin(path, specifier, `file:${path}`);
}

async function prepareNpmPlugin(specifier: string): Promise<PluginLockEntry> {
  const { packageName, range } = parseNpmSpecifier(specifier);
  const metadata = JSON.parse((await download(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
    5,
    10 * 1024 * 1024,
  )).toString('utf8'));
  const version = metadata['dist-tags']?.[range] || semver.maxSatisfying(Object.keys(metadata.versions || {}), range);
  if (!version || !metadata.versions?.[version]) throw new Error(`No npm plugin version satisfies ${range}`);
  const info = metadata.versions[version];
  const buffer = await download(info.dist.tarball);
  verifySri(buffer, info.dist.integrity || info.dist.shasum);
  const temporary = join(tmpdir(), `skillctl-plugin-${randomUUID()}`);
  await mkdir(temporary, { recursive: true });
  const archive = join(tmpdir(), `skillctl-plugin-${randomUUID()}.tgz`);
  try {
    await writeFile(archive, buffer);
    await tar.x({ cwd: temporary, file: archive, strip: 1, preservePaths: false });
    await assertPluginTreeContained(temporary);
    const inspected = await inspectPlugin(temporary, specifier, `npm:${packageName}@${version}`);
    const destination = join(pluginsDir, inspected.name, version);
    await mkdir(dirname(destination), { recursive: true });
    await rm(destination, { recursive: true, force: true });
    await cp(temporary, destination, { recursive: true, force: true, verbatimSymlinks: true });
    await assertPluginTreeContained(destination);
    return {
      ...inspected,
      path: destination,
      entrypoint: resolvePathInside(destination, inspected.entrypoint, 'plugin entry'),
      integrity: await computeDirIntegrity(destination),
      tarballUrl: info.dist.tarball,
      tarballIntegrity: info.dist.integrity || info.dist.shasum,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(archive, { force: true });
  }
}

async function inspectPlugin(path: string, specifier: string, resolvedSpecifier: string): Promise<PluginLockEntry> {
  await assertPluginTreeContained(path);
  const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  const config = pkg.skillctl || {};
  const relativeEntry = config.plugin || pkg.main;
  if (!pkg.name || !relativeEntry) throw new Error('Plugin package requires name and skillctl.plugin entry');
  const entrypoint = resolvePathInside(path, relativeEntry, 'plugin entry');
  if (!(await stat(entrypoint).catch(() => null))) throw new Error(`Plugin entry does not exist: ${relativeEntry}`);
  const apiVersion = Number(config.apiVersion ?? 1);
  if (apiVersion !== 1) throw new Error(`Unsupported plugin API version: ${apiVersion}`);
  return {
    name: pkg.name,
    specifier,
    resolved: resolvedSpecifier,
    integrity: await computeDirIntegrity(path),
    path,
    entrypoint: relativeEntry,
    apiVersion,
    capabilities: Array.isArray(config.capabilities) ? config.capabilities.filter((value: unknown) => typeof value === 'string') : [],
    fetchedAt: new Date().toISOString(),
  };
}

function inspectionFromPackage(
  lock: PluginLockEntry,
  pkg: Record<string, any>,
  options: { requested: string; trusted: boolean; trustReason: string; publisher?: { name?: string; email?: string }; tarballUrl?: string; tarballIntegrity?: string },
): PluginInspection {
  return {
    name: lock.name,
    requested: options.requested,
    resolvedVersion: String(pkg.version || lock.resolved),
    publisher: options.publisher?.name ? { name: options.publisher.name, email: options.publisher.email } : undefined,
    tarballUrl: options.tarballUrl,
    tarballIntegrity: options.tarballIntegrity,
    entrypoint: lock.entrypoint,
    apiVersion: lock.apiVersion,
    capabilities: lock.capabilities,
    dependencies: objectStrings(pkg.dependencies),
    scripts: objectStrings(pkg.scripts),
    trusted: options.trusted,
    trustReason: options.trustReason,
    warnings: [
      'Plugin capabilities are declarations, not permissions.',
      'Plugins execute Node.js with your user permissions and are not sandboxed.',
    ],
  };
}

function objectStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function globMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

async function migrateLegacy(manifest: PluginManifestFile): Promise<void> {
  if (Object.keys(manifest.plugins).length) return;
  const config = await loadConfig();
  if (!config.plugins?.length) return;
  for (const plugin of config.plugins) manifest.plugins[plugin.name] = { specifier: `file:${plugin.path}`, enabled: plugin.enabled, allowLocal: true };
  await saveJson(manifestPath, manifest);
}

function parseNpmSpecifier(specifier: string): { packageName: string; range: string } {
  const raw = specifier.slice(4);
  const index = raw.lastIndexOf('@');
  return index > 0 ? { packageName: raw.slice(0, index), range: raw.slice(index + 1) || 'latest' } : { packageName: raw, range: 'latest' };
}

function verifySri(buffer: Buffer, expected: string): void {
  if (/^[0-9a-f]{40}$/i.test(expected)) {
    if (createHash('sha1').update(buffer).digest('hex') !== expected.toLowerCase()) throw new Error('Plugin tarball integrity mismatch');
    return;
  }
  const match = /^([a-z0-9]+)-(.+)$/i.exec(expected || '');
  if (!match || createHash(match[1]).update(buffer).digest('base64') !== match[2]) throw new Error('Plugin tarball integrity mismatch');
}

function download(url: string, redirects = 5, maxBytes = 50 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') { reject(new Error('Plugin downloads require HTTPS')); return; }
    const request = https.get(parsed, { headers: { 'User-Agent': 'skillctl' } }, (response) => {
      if ((response.statusCode || 0) >= 300 && (response.statusCode || 0) < 400 && response.headers.location) {
        response.resume();
        if (!redirects) { reject(new Error('Too many plugin download redirects')); return; }
        download(new URL(response.headers.location, parsed).toString(), redirects - 1, maxBytes).then(resolvePromise, reject);
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`Plugin download failed: HTTP ${response.statusCode}`)); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error(`Plugin download exceeds ${maxBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolvePromise(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.setTimeout(8_000, () => request.destroy(new Error('Plugin download timed out')));
    request.on('error', reject);
  });
}

async function assertPluginTreeContained(rootPath: string): Promise<void> {
  const rootReal = await realpath(rootPath);
  const visit = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const item = await lstat(path);
      if (item.isSymbolicLink()) {
        const target = resolve(dirname(path), await readlink(path));
        const targetReal = await realpath(target).catch(() => target);
        const relativeTarget = targetReal.slice(rootReal.length);
        if (targetReal !== rootReal && !relativeTarget.startsWith('\\') && !relativeTarget.startsWith('/')) {
          throw new Error(`Plugin symlink escapes package root: ${path}`);
        }
      } else if (item.isDirectory()) await visit(path);
    }
  };
  await visit(rootPath);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw err; }
}

async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}
