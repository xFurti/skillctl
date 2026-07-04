import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadManifest, createDefaultManifest } from '@skillctl/manifest';
import { loadLockfile, createEmptyLockfile } from '@skillctl/lockfile';
import { loadConfig } from '@skillctl/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json (works in built dist and source)
const pkgPath = join(__dirname, '..', 'package.json');
let version = '0.0.1';
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  version = pkg.version || version;
} catch {
  // fallback in case of packaging layout
}

const program = new Command();

program
  .name('skillctl')
  .description('Universal package-manager-like CLI for Agent Skills')
  .version(version, '-v, --version', 'output the current version')
  .helpOption('-h, --help', 'display help for command');

// PR3: list and doctor stubs (load manifest/lock/config for realism)
program
  .command('list')
  .description('List installed skills from lockfile (and manifest)')
  .option('--json', 'output JSON')
  .action(async (options) => {
    const cwd = process.cwd();
    const manifest = await loadManifest(cwd);
    const lock = await loadLockfile(cwd);
    const skills = lock ? Object.keys(lock.skills) : [];
    if (options.json) {
      console.log(JSON.stringify({ manifest: manifest ?? null, lock: lock ?? null, skills }, null, 2));
      return;
    }
    console.log('skillctl list (stub)');
    if (manifest) {
      console.log('Manifest found with', Object.keys(manifest.agentSkills?.dependencies || {}).length, 'deps');
    } else {
      console.log('No agent-skills.json (run init in future PR)');
    }
    console.log('Skills in lock:', skills.length ? skills.join(', ') : '(none)');
  });

program
  .command('doctor')
  .description('Diagnose environment, links, config, manifest/lock issues (stub)')
  .option('--json', 'output JSON')
  .action(async (options) => {
    const cwd = process.cwd();
    const [config, manifest, lock] = await Promise.all([
      loadConfig(),
      loadManifest(cwd),
      loadLockfile(cwd),
    ]);
    const issues: string[] = [];
    if (!manifest) issues.push('No agent-skills.json in project');
    if (!lock) issues.push('No agent-skills.lock (run install in future)');
    // collision policy note surfaced
    issues.push('Collision policy: project manifest wins over global (future); duplicates checked in manifest parser');
    const report = {
      status: issues.length ? 'issues' : 'ok',
      config: { store: config.store, defaultMode: config.defaultMode },
      manifestPresent: !!manifest,
      lockPresent: !!lock,
      lockVersion: lock?.lockfileVersion,
      issues,
      note: 'PR3 stubs + basic validation. Full checks in later PRs.',
    };
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log('skillctl doctor (stub)');
    console.log('Config store:', report.config.store);
    console.log('Manifest:', report.manifestPresent ? 'present' : 'missing');
    console.log('Lockfile v' + (report.lockVersion || '?') + ':', report.lockPresent ? 'present' : 'missing');
    if (issues.length) console.log('Issues:', issues.join('; '));
    console.log('Exit code would be', issues.length ? 1 : 0, '(warnings=1, errors=2 per design)');
  });

// Basic init stub too (mentioned in plan, helps fixtures)
program
  .command('init')
  .description('Initialize agent-skills.json in current project (stub)')
  .action(async () => {
    const existing = await loadManifest();
    if (existing) {
      console.log('agent-skills.json already exists');
      return;
    }
    // would save in full, here just show
    const sample = createDefaultManifest('demo-project');
    console.log('Would create agent-skills.json with:', JSON.stringify(sample, null, 2));
    console.log('(full save + lock in later PRs)');
  });

// Export program for tests, future lib use, or bin shim.
// parse() is intentionally called from the bin entry (packages/cli/bin/skillctl.js)
// to avoid side effects on `import '@skillctl/cli'` or `require`.
export { program };
