# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] - 2026-07-14

### Added

- Added one shared strict `SKILL.md` parser for info, validation, import, and audit, reusing the canonical directory-integrity algorithm for lock compatibility.
- Added provider-aware, namespaced catalog results and `search --provider` with descriptions, owners, update timestamps, stale state, and popularity metadata.
- Added `backup list`, `backup info`, `backup restore`, and `backup remove` with JSON, dry-run, integrity verification, confirmation, rollback, and Windows-safe storage IDs.
- Added `plugin add --dry-run` to report resolved package, publisher, tarball and SRI, entrypoint, API version, capabilities, dependencies, scripts, and trust status without installation.
- Added versioned, opt-in artifact contracts under `.skillctl/artifacts/` and central field-aware secret redaction, including streaming output.

### Security

- Expanded offline audit categories and remediation for provenance, filesystem, execution, network, secrets, prompt injection, policy, plugins, and managed targets.
- Added confidence and non-secret evidence to heuristic findings; semantic and prompt-injection heuristics remain informational or warning-level unless deterministic.
- Preserved hashes, integrity values, versions, and identifiers during redaction and added false-positive and split-stream regression tests.

### Compatibility

- Kept config version `1`, lock schema `1.0`, and the canonical integrity algorithm used by `0.6.x` and `0.7.x` locks.

## [0.7.4] - 2026-07-14

### Fixed

- Removed stale active `0.5` documentation metadata and added canonical, Open Graph, Twitter Card, and social-preview metadata.
- Centralized first-party CLI output so JSON mode emits one schema-1 envelope on stdout while warnings and errors use stderr with consistent exit codes.
- Made every plugin lifecycle command support the same structured JSON contract.

### Testing

- Added JSON contract coverage that rejects direct `console.*` output from command handlers.
- Added cross-platform pre-publish smoke tests for packed tarballs and post-publish smoke tests for the exact npm package before tag and GitHub Release creation.
- Kept release publishing idempotent when a post-publish smoke check fails.

## [0.7.3] - 2026-07-14

### Added

- Added Bash, Zsh, and PowerShell completion scripts with dynamic installed-skill and plugin candidates.

### Changed

- Centralized deterministic human/JSON rendering behavior, TTY detection, Unicode fallback, and machine-safe output conventions.

### Documentation

- Updated the root and CLI READMEs, design baseline, bilingual documentation site, and first-party skill for discovery, maintenance, plugins, SARIF, completion, and Trusted Publishing.

## [0.7.2] - 2026-07-14

### Added

- Added offline SARIF 2.1.0 audit output, configurable trusted-source policy, plugin audit rules, and stable finding locations/fingerprints.

### Security

- Audit reports incomplete provenance, mutable legacy resolutions, suspicious scripts, path/symlink escapes, size limits, plugin failures, and canonical-target drift without requiring network access.

## [0.7.1] - 2026-07-14

### Added

- Added the experimental plugin lifecycle (`add`, `install`, `update`, `enable`, `disable`, `info`, `doctor`, `remove`, and `list`) with separate manifest/lock files, npm SRI verification, API/capability checks, and isolated load failures.

### Security

- Plugin downloads require HTTPS, enforce time and size limits, validate tarball integrity, reject escaping entrypoints and symlinks, and verify installed content before every load.
- Plugins execute Node.js with user permissions and are explicitly not described as sandboxed.

## [0.7.0] - 2026-07-14

### Added

- Added catalog discovery through `skillctl search` and read-only source inspection through `skillctl info`, backed by the public skills.sh API with strict response validation, timeout/retry behavior, a 15-minute cache, and stale offline fallback.
- Added selected `skills.sh/<owner>/<repo>/<skill>` specifiers. Locks pin the repository commit and selector so frozen installs repeat selection without consulting the catalog.
- Added deterministic `outdated` plans and expanded `update` with `--dry-run`, `--latest`, `--save`, confirmation rules, partial network reporting, and rollback of multi-skill updates.
- Added target reconciliation states to `doctor`, explicit `sync --replace-unmanaged` with narrow skill/agent/scope selectors, and automatic backups plus restoration on failure.

### Changed

- Release workflows now use current Node 24 action runtimes and npm Trusted Publishing instead of `NPM_TOKEN`.
- Official publication is idempotent: already-published package versions are accepted only when their SRI matches the prepared tarball, and tag/release creation happens after all eleven packages are verified.
- GitHub Releases use curated changelog notes, an annotated tag, and attach all eleven package tarballs.
- All eleven packages remain version-aligned; manifest version `1` and lock schema `1.0` remain compatible with 0.6 projects.

### Security

- Unmanaged agent content is never replaced implicitly; explicit replacement requires confirmation and creates a restorable metadata-bearing backup.

## [0.6.1] - 2026-07-13

### Fixed

- Realigned the first-party `skillctl` skill and all bundled references with the 0.6 project-local store, plain import flow, explicit global operations, and Pi adapter.
- Migrated the repository's own meta-skill lock and vendored store away from the legacy global canonical path so `doctor` and `audit` work on a fresh clone.
- Corrected stale Italian and English documentation examples that still emitted `local:imported` entries or used removed import flags.
- Upgraded GitHub Actions to their Node 24 runtimes and pinned the macOS matrix to macOS 15 to avoid runner migration warnings.
- Made directory integrity hashes independent of Windows/POSIX path separators while accepting legacy hashes from either platform.
- Serialized workspace test execution to avoid intermittent Node test-runner IPC deserialization failures under CI load.
- Fixed the release publish job by installing pnpm before Node's automatic package-manager cache setup, and moved artifact actions to their Node 24 releases.

### Documentation

- Added migration guidance for pre-0.6 local locks and clarified which project files must be committed.
- Updated the design baseline and documentation site to describe separate project and personal stores consistently.

## [0.6.0] - 2026-07-13

### Added

- Project-local `.skillctl/skills/` store with parent-project discovery and clear errors when local operations run outside an initialized project.
- Explicit global operations via `add -g`, `list -g`, `doctor -g`, and `remove -g`.
- Native Pi adapter for `.pi/skills/` and `~/.pi/agent/skills/`.
- Plain `skillctl import`, with automatic agent discovery, identical-content deduplication, optional `--select`, and interactive conflict resolution.

### Changed

- Local and imported skills are copied into the project store and recorded with portable `file:./.skillctl/skills/<name>` specifiers.
- Conflicting same-name imports abort before project state is updated unless the user resolves them with `--interactive`.

## [0.5.0] - 2026-07-09

### Added

- Immutable GitHub and skills.sh resolutions pinned to full commit SHAs, plus exact npm versions and tarball integrity in lock provenance.
- Frozen installation can restore an empty or corrupt canonical store directly from a valid lockfile without rewriting it.
- Scoped synchronization with `--project`, `--global`, repeatable/comma-separated `--agent`, and opt-in managed `--prune`.
- Cross-process project/store locks and transactional manifest/lock updates with interrupted-operation recovery.
- A uniform single-document JSON envelope for first-party commands and stable exit codes 0/1/2.
- Repository-wide c8 coverage gates, CLI lifecycle E2E coverage, and guarded monorepo release/pack tooling.

### Security

- Updated `tar` to the patched 7.x line and added archive entry/count/expanded-size limits.
- Reject registry and plugin paths that escape their extraction root, escaping symlinks, invalid cache keys, oversized downloads, redirect loops, and npm integrity mismatches.
- Refuse to overwrite or remove unmanaged agent targets; copy-mode targets now carry ownership metadata.

### Fixed

- Prevented overlapping typing/render timers from corrupting the animated terminal on the documentation home page.
- `skillctl sync --dry-run` no longer creates links or copies.
- Mutable GitHub refs bypass the immutable download cache; `GITHUB_TOKEN` and `GH_TOKEN` are honored.
- `install --frozen` checks manifest/lock consistency, and install/update/remove now handle `devDependencies`.
- CLI actions are awaited with Commander `parseAsync`; non-interactive confirmation no longer defaults to destructive consent.
- Project import detects linked skills and refuses same-name content conflicts.

### Changed

- Config parsing fails clearly on corrupt or invalid files, custom config writes are atomic, and `SKILLCTL_STORE` can override the canonical store for isolated environments.
- Tests no longer mask failures; CLI, link safety, plugin containment, config, frozen installs, and dry-run behavior have regression coverage.
- `sync` keeps project+global as its default scope; pruning remains disabled unless explicitly requested.
- All eleven workspace packages are versioned and packed together in dependency order.

### Migration notes

- Lockfile schema remains `1.0`. Legacy 0.4 entries are readable, but frozen install rejects mobile GitHub/npm resolutions until `skillctl update` pins them.
- `doctor` reports `mutable-resolution`, non-reproducible `local:imported` entries, interrupted journals, and stale operation locks.

### Documentation

- Updated all Markdown references and the bilingual docs site for the 0.5 immutable lock, frozen restore, scoped sync/prune, transaction, JSON, and release workflows.

## [0.4.0] - 2026-07-07

### Added

- **First-party meta-skill** — `skills/skillctl/` (`SKILL.md` + `references/`) teaches agents how to use skillctl; repo dogfoods via root `agent-skills.json` + `agent-skills.lock`.
- **Grok adapter** — sync to `.grok/skills` (project) and `~/.grok/skills` (global).
- **`skillctl skill validate [path]`** — lint a `SKILL.md` directory (frontmatter, scripts, size); CI validates `skills/skillctl`.
- **`skillctl init --with-skill`** — bootstrap manifest and add meta-skill from GitHub (or `file:./skills/skillctl` when developing skillctl itself).

### Changed

- Default `trustedSources` includes `github:xFurti/skillctl/*`.

## [0.3.1] - 2026-07-07

### Fixed

- **Git-portable manifest and lock (#2)** — `add` / `install` no longer persist machine-local absolute paths in `agent-skills.json` or `agent-skills.lock`.
  - Local specifiers normalize to `file:./<project-relative>` or `local:imported/<name>` (auto-import for paths outside the project).
  - Lock `specifier` and `resolved` mirror the portable manifest form; `canonicalPath` uses `~/.skillctl/skills/<name>`.
  - Runtime resolves tilde and legacy absolute lock paths (with store fallback) for `install`, `sync`, `audit`, and `doctor`.
- **`doctor`** — Warns when manifest/lock still contain non-portable paths (suggests `skillctl install` to rewrite).

### Changed

- **Authors** — README, LICENSE, CONTRIBUTING, and package metadata credit **xFurti** and **Gabry848**.

## [0.3.0] - 2026-07-07

### Added

- **`skillctl import from-project`** — Discovers skills in agent directories (`.codex/skills`, `.claude/skills`, `.agents/skills`, `.opencode/skills`, `.gemini/skills`) and migrates them into the canonical store with zero manual paths.
- **Interactive import wizard on `skillctl init`** — Offers to import detected project skills after creating `agent-skills.json` (skip with `--no-prompt`).
- **`local:imported/<name>` manifest specifier** — Migrated skills reference the canonical store, not legacy agent paths.
- **Lock provenance fields** — `migratedFrom: project-scan`, `originalPath`, `adapter` preserved in `agent-skills.lock`.

### Fixed

- **Git-portable project links (#1)** — `sync` now creates **relative** symlinks for project agent directories (`.codex/skills`, `.claude/skills`, etc.) instead of absolute `~/.skillctl` paths that break on other machines.

### Changed

- **`import from-project` defaults** — Updates manifest and lock by default; use `--no-manifest` / `--lock-only` for advanced cases.
- **`--sync` flag** — Replaces `--adopt` on import commands (`--adopt` kept as deprecated alias).
- **`doctor` coexistence** — Scans all adapter project skill directories, recommends `import from-project --dry-run`.

## [0.2.0] - 2026-07-05

### Added

- **`skillctl import from-npx`** — Migrate skills from `npx skills` (`skills-lock.json` and `.agents/skills/`). Supports `--dry-run`, `--adopt`, `--write-manifest`.
- **`skillctl import from-skillctl`** — Migrate from Python skillctl (`~/.skillctl/repos/`). Supports `--dry-run`, `--adopt`, `--write-manifest`.
- **`skillctl audit`** — Security scanner on installed skills (integrity drift, script heuristics, name/dir match, path traversal, size limits). Supports `--json` and `--strict`.
- **`skillctl update [names...]`** — Re-fetch skills from their specifiers and re-sync agent links.
- **`skillctl plugin`** — Experimental plugin management (`list`, `enable`, `add`, `remove`). Opt-in via `experimental.plugins` in config.
- **`install --frozen`** — Fail if lock integrity does not match canonical store (exit 2).
- **`doctor --fix`** — Re-sync agent links from lock; integrates lightweight audit findings.
- **New packages**:
  - `@skillctl/import` — npx skills / Python skillctl migration parsers and orchestration.
  - `@skillctl/security` — Audit rule engine and report types.
  - `@skillctl/plugin-system` — Dynamic plugin loader (commands, adapters, registry sources).
- **New adapters**: Codex (`~/.codex/skills`) and Gemini CLI (`~/.gemini/skills`).
- **Core helpers**: `canonicalizeName`, `resolveAdapterTarget`, `needsInstall`, `verifyLockIntegrity`, `lockToSkillTargets`, `purgeCanonical`.
- **Extended types**: `ResolvedSource.sourceId` / `originalSpec`, `Provenance.migratedFrom`, `SkillLockfile.metadata`, `config.experimental.plugins`.

### Changed

- **Registry refactored** — `registry.ts` monolith split into `sources/`, `fetch/`, `locate-skill.ts`, `manager.ts`.
- **CLI restructured** — Commands moved to `packages/cli/src/commands/*` (one file per command).
- **Adapter registration unified** — Single source of truth via `registerAdapter` / `getRegisteredAdapters` in `@skillctl/core` (removed duplicate hardcoded list).
- **`install` fast-path** — Skips fetch when canonical path exists and integrity matches lock entry.
- **`doctor` output** — Coexistence notes moved to `info` (no longer false-positive issues); actionable import recommendations.
- **`skills.sh` name-only specs** — Now fail fast with clear error; require `owner/repo` form (e.g. `skills.sh/vercel-labs/agent-skills`).
- **Version** bumped to 0.2.0 across root and `@skillctl/cli`.

### Fixed

- **`remove`** — Uses `resolveAdapterTarget` instead of rough path concatenation.
- **`sync`** — Consistent project/global path resolution via shared helper.

### Documentation

- README and CHANGELOG updated for v0.2 scope.

### Known / Notes

- Plugin system is **experimental** — enable with `skillctl plugin enable` or `experimental.plugins: true` in config.
- `import from-npx` parser is tolerant of `skills-lock.json` schema variations; edge cases may need manual `add`.
- Global scope (`--global` on add/remove) not yet implemented; project scope only.
- Long-tail agents (Continue, Windsurf, etc.) planned for v0.3+ via adapter table or plugins.

## [0.1.0] - 2026-07-04

### Added (v0.1 Release Candidate)

- **Comprehensive commands** (polished from stubs): `init`, `add`, `install` (alias `i`), `list`, `sync`, `remove` (alias `rm`), `doctor`. Full integration with manifest/lock/registry/adapters/link-manager.
- **Performance cache (PR12)**: Content-addressable `~/.skillctl/cache/` keyed by integrity (sha256) for extracted skills + download tarball cache under `downloads/`. Reuses identical trees, skips redundant work.
- **Limited parallel fetches**: `SKILLCTL_PARALLEL` env (default 6) with concurrency limiter in RegistryManager. Used for network ops.
- **Fast-path hashing**: `getDirStatSignature` + lock-stored integrity checks before full `computeDirIntegrity` recursive SHA (only rehash on drift/force).
- **Expanded Windows CI + Coexistence matrix**:
  - Full matrix: ubuntu/macos/windows x Node 20/22.
  - Dedicated `windows-coexistence-matrix` job with 4 scenarios (none, npx-hint, python-hint, mixed).
  - Large-scale simulation (20+ skills, timing, cache validation, parallel env).
  - Junctions, links, doctor, install/sync/remove exercised on Windows.
- **npm publish dry-run job** in CI + notes for `@skillctl/cli` scoped publish.
- **Coexistence detection** enhancements surfaced in doctor + tests (`.agents/skills`, skills-lock.json, ~/.skillctl hints, npx markers).
- **Examples** in README + smoke tests in CI.
- New core `cache.ts` (get/put cached skill/download, ensure, clear, stat match helpers). Exported via `@skillctl/core`.

### Changed / Polished

- CLI: functional `install`/`sync`/`remove` (best-effort unlinks, cache fastpaths, purge option); removed "(stub)" notes; init now actually saves manifest.
- Registry: wrapped fetches with limiter; integrated cache checks/populate in materialize + per-source download caches (npm/github).
- README: complete rewrite for v0.1 — all commands, quickstart examples, config, perf/cache details, coexistence/migration warnings + strategy, prior art (Python skillctl + npx skills), Windows notes, development, release/npm publish, full test matrix.
- Version bumped to 0.1.0 across root + all workspace packages.
- CI: smoke tests, coexistence, large-scale, publish-dry-run, parallel env, Windows pwsh specifics.
- Design notes updated in comments for PR12 items (cache, parallel, Windows CI).
- Minor fixes/polish: doctor/list output, add logging, remove path handling, error resilience.

### Documentation

- Comprehensive README.md (commands + warnings + prior art + migration + examples + perf + npm).
- New CHANGELOG.md.
- CI documents the expanded matrix.
- Notes on scoped publish, dry-run, post-publish verification.

### Performance & Scale

- Cache + parallel + stat fastpath implemented per design (Issue 8).
- Validated via CI large-scale job (simulates 50-200 skills targets).
- See README "Performance Cache & Notes".

### Breaking / Migration (from pre-0.1 scaffolding)

- Versions now 0.1.0 (use exact tags).
- More commands available; previous stubs now execute.
- Canonical + cache dirs created on demand.
- Recommend re-running `doctor` after upgrade.

[0.6.1]: https://github.com/xFurti/skillctl/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/xFurti/skillctl/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/xFurti/skillctl/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/xFurti/skillctl/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/xFurti/skillctl/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/xFurti/skillctl/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/xFurti/skillctl/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/xFurti/skillctl/releases/tag/v0.1.0
