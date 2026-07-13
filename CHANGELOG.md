# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[0.5.0]: https://github.com/xFurti/skillctl/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/xFurti/skillctl/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/xFurti/skillctl/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/xFurti/skillctl/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/xFurti/skillctl/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/xFurti/skillctl/releases/tag/v0.1.0
