import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageOrder = [
  'core',
  'manifest',
  'lockfile',
  'link-manager',
  'plugin-system',
  'project-state',
  'adapters',
  'security',
  'registry',
  'import',
  'cli'
];
const corepack = process.platform === 'win32'
  ? join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js')
  : null;
const npmCli = process.platform === 'win32'
  ? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  : null;
const toolShimRoot = process.platform === 'win32' ? await mkdtemp(join(tmpdir(), 'skillctl-tools-')) : null;
if (toolShimRoot) {
  await writeFile(
    join(toolShimRoot, 'pnpm.cmd'),
    `@"${process.execPath}" "${corepack}" pnpm %*\r\n`
  );
}

// GitHub Actions installs the pinned pnpm version before this script runs.
// Using it directly avoids the stale Corepack bundled with Node 22.13, whose
// registry signing keys cannot verify current pnpm releases.
const useInstalledPnpm = Boolean(process.env.CI) && process.platform !== 'win32';

function runPnpm(args, options = {}) {
  if (useInstalledPnpm) return run('pnpm', args, options);
  if (corepack) return run(process.execPath, [corepack, 'pnpm', ...args], options);
  return run('corepack', ['pnpm', ...args], options);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    ...options
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return result;
}

function packageArchiveName(name, version) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
}

async function assertFile(path, message) {
  const value = await stat(path).catch(() => null);
  if (!value?.isFile()) throw new Error(message);
}

const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = rootPackage.version;
const artifactsRoot = resolve(root, 'artifacts');
const output = resolve(artifactsRoot, version);
if (!output.startsWith(`${artifactsRoot}${sep}`)) throw new Error('Refusing to clean an artifact path outside artifacts/.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const archives = [];
runPnpm(['-r', 'build']);
for (const directoryName of packageOrder) {
  const directory = join(root, 'packages', directoryName);
  const packageJson = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (packageJson.version !== version) {
    throw new Error(`${packageJson.name} is ${packageJson.version}; expected ${version}`);
  }

  const packArgs = ['pnpm', '--dir', directory, 'pack', '--pack-destination', output];
  const packOptions = {
    capture: true,
    env: toolShimRoot
      ? { ...process.env, PATH: `${toolShimRoot};${process.env.PATH || ''}` }
      : process.env
  };
  runPnpm(packArgs, packOptions);
  const archive = join(output, packageArchiveName(packageJson.name, packageJson.version));
  await assertFile(archive, `Missing archive for ${packageJson.name}: ${archive}`);

  const extracted = await mkdtemp(join(tmpdir(), 'skillctl-pack-'));
  try {
    run('tar', ['-xzf', archive, '-C', extracted]);
    const packagedRoot = join(extracted, 'package');
    await assertFile(join(packagedRoot, 'package.json'), `${packageJson.name} has no package.json`);
    await assertFile(join(packagedRoot, 'LICENSE'), `${packageJson.name} has no LICENSE`);
    await assertFile(join(packagedRoot, 'dist', 'index.js'), `${packageJson.name} has no dist/index.js`);

    const packagedJson = JSON.parse(await readFile(join(packagedRoot, 'package.json'), 'utf8'));
    const dependencySections = [packagedJson.dependencies, packagedJson.optionalDependencies, packagedJson.peerDependencies];
    for (const dependencies of dependencySections) {
      for (const [name, range] of Object.entries(dependencies || {})) {
        if (String(range).startsWith('workspace:')) {
          throw new Error(`${packageJson.name} still contains ${name}: ${range}`);
        }
      }
    }

    const packageFiles = await readdir(packagedRoot, { recursive: true });
    const unwanted = packageFiles.find((path) => /(^|[\\/])(src|test)([\\/]|$)/.test(path));
    if (unwanted) throw new Error(`${packageJson.name} contains unnecessary source/test file: ${unwanted}`);
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }
  archives.push(archive);
}

const installRoot = await mkdtemp(join(tmpdir(), 'skillctl-install-'));
try {
  if (npmCli) run(process.execPath, [npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund', ...archives], { cwd: installRoot });
  else run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...archives], { cwd: installRoot });
  const bin = join(installRoot, 'node_modules', '@skillctl', 'cli', 'bin', 'skillctl.js');
  const result = run(process.execPath, [bin, '--version'], { cwd: installRoot, capture: true });
  if (result.stdout.trim() !== version) {
    throw new Error(`Packed CLI reported ${result.stdout.trim()}; expected ${version}`);
  }
} finally {
  await rm(installRoot, { recursive: true, force: true });
}

console.log(`Verified ${archives.length} installable archives in ${relative(root, output)}.`);
if (toolShimRoot) await rm(toolShimRoot, { recursive: true, force: true });
