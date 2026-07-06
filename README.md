<p align="center">
  <img src="brand/skillctl-banner.png" alt="skillctl — Universal package manager for Agent Skills" width="100%">
</p>

# skillctl

Universal, package-manager-style CLI for managing **Agent Skills** across AI coding agents.

`skillctl` provides a single canonical store at `~/.skillctl/skills/` and automatically materializes skills (via symlinks, junctions on Windows, or copies) into the directories used by Claude Code, Cursor, OpenCode, Codex, Gemini CLI, and other agents (via the Agent Skills open standard at [agentskills.io](https://agentskills.io)).

> **Status**: v0.2.0. See [CHANGELOG.md](./CHANGELOG.md), [skillctl-design.md](./skillctl-design.md), and CI test matrix.

## Installation

```bash
npm install -g @skillctl/cli
# or
pnpm add -g @skillctl/cli
# or use without global install
npx @skillctl/cli --help
```

After install, the `skillctl` command is available (via bin shim in the scoped package).

**Scoped package note**: Primary package is `@skillctl/cli`. Unscoped `skillctl` on npm is left unclaimed to avoid collision with existing Python `skillctl` packages. `npm i -g @skillctl/cli` still provides the `skillctl` command UX.

## Quick Start

```bash
# Initialize a project manifest
skillctl init

# Add skills from multiple sources
skillctl add vercel-labs/agent-skills#web-design-guidelines
skillctl add npm:some-skill-pkg
skillctl add ./local-skills/my-review
skillctl add skills.sh/vercel-labs/agent-skills

# Install all deps from manifest into canonical store + sync agents
skillctl install

# Or step-wise
skillctl add owner/repo
skillctl sync

# Migrate from npx skills (if you already use it)
skillctl import from-npx --dry-run
skillctl import from-npx --adopt --write-manifest

# Security check
skillctl audit
skillctl audit --json

# Diagnostics
skillctl doctor
skillctl doctor --fix

# Environment
SKILLCTL_PARALLEL=4 skillctl install
```

Project files (committed):
- `agent-skills.json` (like package.json)
- `agent-skills.lock` (reproducible YAML lock, like pnpm-lock.yaml)

Canonical store: `~/.skillctl/skills/<name>/SKILL.md` + optional `scripts/`, `references/`.

## Commands (v0.2)

| Command | Description |
|---------|-------------|
| `init` | Create starter `agent-skills.json` |
| `add <spec>` | Add from `github:`, `npm:`, `skills.sh/`, `file:`, shorthands. Updates manifest + lock. |
| `install` / `i` | Ensure all manifest deps are in canonical store; sync agents. `--frozen` fails on integrity drift. `--no-sync` skips linking. |
| `update [names...]` | Re-fetch skills from specifiers and re-sync. |
| `list [--json]` | Show skills from lock + manifest summary. |
| `sync [--dry-run]` | Link canonical skills to all detected agent targets. |
| `remove <name>` / `rm` | Remove from manifest/lock + unlink. `--purge` deletes canonical copy. |
| `import from-npx` | Migrate from `npx skills` (`skills-lock.json`, `.agents/skills/`). `--dry-run`, `--adopt`, `--write-manifest`. |
| `import from-skillctl` | Migrate from Python skillctl (`~/.skillctl/repos/`). |
| `audit [--json] [--strict]` | Security scan: integrity, scripts, names, paths, sizes. Exit 0/1/2. |
| `doctor [--json] [--fix]` | Environment, adapters, coexistence, audit summary. `--fix` re-syncs links. |
| `plugin list\|enable\|add\|remove` | Experimental plugin management. |
| `-v, --version` / `-h, --help` | Version and help. |

All commands respect `~/.skillctl/config.json` (store path, link mode, enabled agents).

## Supported Agents (built-in adapters)

| Agent | Project path | Global path |
|-------|--------------|-------------|
| Claude Code | `.claude/skills` | `~/.claude/skills` |
| Cursor | `.agents/skills` | `~/.cursor/skills` |
| OpenCode | `.opencode/skills` | `~/.config/opencode/skills` |
| Codex | `.codex/skills` | `~/.codex/skills` |
| Gemini CLI | `.gemini/skills` | `~/.gemini/skills` |

More agents via plugins (experimental) or future adapter releases.

## Configuration & Environment

`~/.skillctl/config.json`:

```json
{
  "version": 1,
  "store": "~/.skillctl/skills",
  "defaultMode": "symlink",
  "agents": {
    "claude-code": true,
    "cursor": true,
    "opencode": true,
    "codex": true,
    "gemini-cli": true
  },
  "trustedSources": ["github:vercel-labs/*", "skills.sh/*"],
  "experimental": {
    "plugins": false
  },
  "plugins": []
}
```

Environment variables:
- `SKILLCTL_PARALLEL=4` (default 6, max 16) — limits concurrent registry fetches.
- `GITHUB_TOKEN=...` — recommended for heavy GitHub tarball use.

## Migration from npx skills

If you already use `npx skills`, `doctor` detects `skills-lock.json` and `.agents/skills/`.

```bash
# Preview what would be imported
skillctl import from-npx --dry-run

# Import into skillctl canonical store + lock
skillctl import from-npx --write-manifest

# Import and re-link all agent targets
skillctl import from-npx --adopt --write-manifest
```

Skills are copied or re-fetched into `~/.skillctl/skills/` with provenance `migratedFrom: npx`. Original npx install is left in place unless you remove it manually.

For Python skillctl (`~/.skillctl/repos/`):

```bash
skillctl import from-skillctl --dry-run
skillctl import from-skillctl --adopt
```

## Performance Cache

- **Content-addressable cache**: `~/.skillctl/cache/<integrity-sha>/` — reused across installs when content matches.
- **Download cache**: tarballs under `cache/downloads/` keyed by hash/url.
- **Install skip**: `install` skips fetch when canonical exists and integrity matches lock.
- **Parallelism**: `SKILLCTL_PARALLEL` controls concurrent network fetches.

## Security & Audit

`skillctl audit` runs static checks (no script execution):

1. Lock integrity vs canonical store (sha256 drift)
2. SKILL.md name vs lock entry name
3. Suspicious patterns in `scripts/` (curl|sh, eval, rm -rf, etc.)
4. Path traversal references in skill files
5. Size limits (large SKILL.md or binary blobs)

Use in CI:

```bash
skillctl audit --json --strict
# exit 2 on warnings or errors
```

## Plugin System (experimental)

Enable plugins in config, then register local plugin packages:

```bash
skillctl plugin enable
skillctl plugin add ./my-skillctl-plugin
skillctl plugin list
```

Plugins install to `~/.skillctl/plugins/` and can register commands, adapters, and registry sources. See [skillctl-design.md](./skillctl-design.md) for the threat model — plugins run arbitrary code; use only trusted sources.

## Coexistence & Prior Art

`skillctl` detects and interoperates with:

- **`npx skills`** (vercel-labs/skills) — `skills-lock.json`, `.agents/skills/`
- **Python skillctl** — `~/.skillctl/repos/`, `manifest.json`
- Other Agent Skills tools: `gh skill`, agent-skills-cli, skillbook, openskills

This project is a **complementary management layer**:
- Declarative `agent-skills.json` + pnpm-style YAML `agent-skills.lock`
- Provenance, audit, import/migration, plugin extensibility
- Single canonical `~/.skillctl/skills/` (`.agents/skills` is a *target*, not the store)

**Name collision warning**: CLI name `skillctl` and path `~/.skillctl/` overlap with Python skillctl. Install via `@skillctl/cli` and review `doctor` output.

## Windows Notes

- Default link mode: **junction** on win32 (no Developer Mode required).
- Falls back to **copy** with warning on EPERM or verification failure.
- `doctor` and `config.defaultMode` allow override.
- CI matrix covers Windows + coexistence scenarios.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm -r lint

# Run CLI locally
node packages/cli/bin/skillctl.js --help
node packages/cli/bin/skillctl.js doctor
node packages/cli/bin/skillctl.js import from-npx --dry-run
```

Monorepo packages:

```
packages/
├── cli/            @skillctl/cli — CLI entrypoint
├── core/           @skillctl/core — types, config, fs, cache, operations
├── manifest/       @skillctl/manifest — agent-skills.json
├── lockfile/       @skillctl/lockfile — agent-skills.lock (YAML)
├── registry/       @skillctl/registry — github, npm, local, skills.sh sources
├── link-manager/   @skillctl/link-manager — symlink/junction/copy
├── adapters/       @skillctl/adapters — agent adapters + sync
├── import/         @skillctl/import — npx/python migration
├── security/       @skillctl/security — audit scanner
└── plugin-system/  @skillctl/plugin-system — plugin loader
```

## Release & npm publish

- Version: **0.2.0** (`@skillctl/cli`).
- Dry-run: `pnpm --filter @skillctl/cli pack --dry-run`
- Publish: `npm publish --access public` from `packages/cli` after tag.
- Verify: `npx @skillctl/cli@latest --version`

## Contributing

Issues and PRs welcome — especially new adapters, registry sources, and audit rules. See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and PR guidelines, and [skillctl-design.md](./skillctl-design.md) for architecture.

## License

[MIT](./LICENSE) — Copyright (c) 2026 skillctl contributors