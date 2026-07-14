# skillctl

<p align="center">
  <img src="brand/skillctl-banner-animated.gif" alt="skillctl — Universal package manager for Agent Skills" width="100%">
</p>

Universal, package-manager-style CLI for managing **Agent Skills** across AI coding agents.

`skillctl` installs project skills into `.skillctl/skills/` and personal skills into `~/.skillctl/skills/`, then syncs them (symlink, junction on Windows, or copy) into Claude Code, Cursor, OpenCode, Codex, Gemini CLI, Grok, Pi, and other [agentskills.io](https://agentskills.io)-compatible agents.

> **Status**: v0.7.3 — catalog discovery, deterministic maintenance plans, reconcilable sync, experimental plugins, SARIF audit, and shell completion. See [CHANGELOG.md](./CHANGELOG.md).

**Documentation** (commands, configuration, migration, troubleshooting): **[xfurti.github.io/skillctl](https://xfurti.github.io/skillctl/)** · IT/EN

## Installation

```bash
npm install -g @skillctl/cli
# or
pnpm add -g @skillctl/cli
# or without global install
npx @skillctl/cli --help
```

Published package: `@skillctl/cli` (scoped). The `skillctl` command is still available in PATH. The unscoped `skillctl` name on npm is intentionally unclaimed to avoid collision with existing Python packages.

## Quick Start

```bash
skillctl init
skillctl import          # copy existing agent skills into .skillctl/skills
skillctl add github:vercel-labs/agent-skills@main#web-design-guidelines
skillctl add npm:some-skill-pkg@^2
skillctl add file:./my-skill
skillctl install          # fetch + sync all agents
skillctl sync             # re-link only
skillctl list
skillctl doctor
```

Discover a skill before installing it, or inspect a source without changing project state:

```bash
skillctl search typescript
skillctl search typescript --owner vercel-labs --add vercel-labs/skills/find-skills --yes
skillctl info skills.sh/vercel-labs/skills/find-skills
```

Project files (commit these):
- `agent-skills.json` — declarative manifest (like `package.json`)
- `agent-skills.lock` — reproducible YAML lockfile (like `pnpm-lock.yaml`)

Project store: `.skillctl/skills/<name>/SKILL.md` (+ optional `scripts/`, `references/`). Commit vendored project skills so private or unpublished skills are available to the whole team.

Global skills are explicit and remain outside the project:

```bash
skillctl add -g file:./my-personal-skill
skillctl list -g
skillctl doctor -g
skillctl remove -g my-personal-skill
```

Local commands search parent directories for `agent-skills.json`. Outside an initialized project, use `-g` or run `skillctl init` first.

## Reproducible installs

Remote requests remain readable in the manifest, while the lock pins GitHub and skills.sh sources to a full commit SHA and npm sources to an exact version plus tarball integrity. On a new machine, or after deleting the store, this restores the exact locked content without changing the lockfile:

```bash
skillctl install --frozen
```

`outdated` reports current, outdated, modified, legacy, unavailable, and unsupported entries independently. `update --dry-run` emits the same plan without writing. `update --latest --save --yes` may cross an npm constraint and records the chosen version exactly; GitHub and skills.sh retain their declared ref.

```bash
skillctl outdated
skillctl update --dry-run
skillctl update my-skill
skillctl update npm-skill --latest --save --yes
```

Imported and local skills use project-relative `file:./.skillctl/skills/<name>` entries, so committed skills remain available without a registry.

### Migrating local skills from 0.5

Project locks created before 0.6 may still reference `~/.skillctl/skills/<name>` or `local:imported/<name>`. Re-add source directories with `skillctl add file:./path/to/skill`, or run `skillctl import` for skills discovered in agent directories. Verify the generated `.skillctl/skills/` content, then commit it together with the refreshed manifest and lock. Global/personal skills remain explicit through `-g`.

## Selective sync and automation

Without scope flags, `sync` keeps the compatible default and targets both project and global directories. Pruning is opt-in and removes only targets that skillctl can prove it manages.

```bash
skillctl sync --project --agent codex
skillctl sync --global --agent codex,claude-code
skillctl sync --project --prune --dry-run
skillctl sync --project --agent codex --skill my-skill --replace-unmanaged --yes
skillctl doctor --json
```

Explicit unmanaged replacement first moves the original target to `.skillctl/backups/sync/` (or the global equivalent) and restores it automatically if replacement fails.

Every first-party command supports `--json` and writes one envelope with `schemaVersion`, `ok`, `command`, `data`, `warnings`, and `errors`. Exit codes are 0 for success, 1 for operational warnings/partial results, and 2 for fatal or validation failures.

## Supported Agents

| Agent | Project path | Global path |
|-------|--------------|-------------|
| Claude Code | `.claude/skills` | `~/.claude/skills` |
| Cursor | `.agents/skills` | `~/.cursor/skills` |
| OpenCode | `.opencode/skills` | `~/.config/opencode/skills` |
| Codex | `.codex/skills` | `~/.codex/skills` |
| Gemini CLI | `.gemini/skills` | `~/.gemini/skills` |
| Grok | `.grok/skills` | `~/.grok/skills` |
| Pi | `.pi/skills` | `~/.pi/agent/skills` |

More agents via plugins (experimental) or future adapter releases.

## skillctl as a skill

The repo ships a first-party Agent Skill at `skills/skillctl/` so coding agents know how to use the CLI (manifest, lock, import, audit). The skillctl repo dogfoods it via root `agent-skills.json`.

```bash
# New project — add meta-skill from GitHub
skillctl init --with-skill

# Or explicitly
skillctl add github:xFurti/skillctl#skills/skillctl
skillctl install

# In-repo (e.g. skillctl monorepo)
skillctl add file:./skills/skillctl
skillctl install && skillctl sync

# Lint a skill directory
skillctl skill validate skills/skillctl
```

## Common Tasks

```bash
# Import every skill already in agent directories without changing the sources
skillctl import --dry-run
skillctl import

# Optional selection and conflict resolution
skillctl import --select
skillctl import --interactive

# Migrate from npx skills
skillctl import from-npx --dry-run
skillctl import from-npx --sync --write-manifest

# Security scan (CI-friendly)
skillctl audit --json --strict
skillctl audit --format sarif --output results.sarif

# Re-fetch and re-sync
skillctl update

# Print shell completion; redirect it using your shell's normal profile setup
skillctl completion powershell
```

Completion scripts are printed to stdout and never modify profiles. Typical setup:

```bash
# Bash
skillctl completion bash > ~/.local/share/bash-completion/completions/skillctl

# Zsh (ensure ~/.zfunc is in fpath)
skillctl completion zsh > ~/.zfunc/_skillctl
```

```powershell
# Current PowerShell session; add the same expression to $PROFILE if desired
skillctl completion powershell | Out-String | Invoke-Expression
```

## Experimental plugins

Plugins can register commands, adapters, registry sources, catalog providers, and audit rules. npm plugins are integrity-locked under `~/.skillctl/plugins/`; local plugins require `--allow-local`. Plugins execute Node.js code with your user permissions and are not sandboxed.

```bash
skillctl plugin add npm:@example/skillctl-plugin@^1
skillctl plugin list
skillctl plugin doctor
skillctl plugin disable @example/skillctl-plugin
```

See the [docs site](https://xfurti.github.io/skillctl/) for the full command reference, config schema, Windows notes, and coexistence with other tools.

## Development

**Requirements:** Node.js >= 22.13, pnpm 11.x

```bash
git clone https://github.com/xFurti/skillctl.git
cd skillctl
pnpm install
pnpm build
pnpm test
```

Run the CLI locally: `node packages/cli/bin/skillctl.js --help`

Architecture and design: [skillctl-design.md](./skillctl-design.md) · Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)

### Maintainer release setup

Each of the eleven `@skillctl/*` npm packages must configure the repository `xFurti/skillctl`, workflow `release.yml`, environment `npm-production`, and `npm publish` as its Trusted Publisher. The workflow needs no `NPM_TOKEN`: it verifies or publishes every tarball by SRI, waits until all packages are visible, and only then creates the annotated tag and GitHub Release.

## Authors

- [xFurti](https://github.com/xFurti)
- [Gabry848](https://github.com/gabry848)

## License

[MIT](./LICENSE) — Copyright (c) 2026 xFurti, Gabry848
