<p align="center">
  <img src="brand/skillctl-banner.png" alt="skillctl — Universal package manager for Agent Skills" width="100%">
</p>

# skillctl

Universal, package-manager-style CLI for managing **Agent Skills** across AI coding agents.

`skillctl` keeps a single canonical store at `~/.skillctl/skills/` and syncs skills (symlink, junction on Windows, or copy) into Claude Code, Cursor, OpenCode, Codex, Gemini CLI, and other [agentskills.io](https://agentskills.io)-compatible agents.

> **Status**: v0.2.0 — see [CHANGELOG.md](./CHANGELOG.md).

**Documentation** (commands, configuration, migration, troubleshooting): **[skillctl.github.io/skillctl](https://skillctl.github.io/skillctl/)** · IT/EN

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
skillctl add vercel-labs/agent-skills#web-design-guidelines
skillctl add npm:some-skill-pkg
skillctl install          # fetch + sync all agents
skillctl sync             # re-link only
skillctl list
skillctl doctor
```

Project files (commit these):
- `agent-skills.json` — declarative manifest (like `package.json`)
- `agent-skills.lock` — reproducible YAML lockfile (like `pnpm-lock.yaml`)

Canonical store: `~/.skillctl/skills/<name>/SKILL.md` (+ optional `scripts/`, `references/`).

## Supported Agents

| Agent | Project path | Global path |
|-------|--------------|-------------|
| Claude Code | `.claude/skills` | `~/.claude/skills` |
| Cursor | `.agents/skills` | `~/.cursor/skills` |
| OpenCode | `.opencode/skills` | `~/.config/opencode/skills` |
| Codex | `.codex/skills` | `~/.codex/skills` |
| Gemini CLI | `.gemini/skills` | `~/.gemini/skills` |

More agents via plugins (experimental) or future adapter releases.

## Common Tasks

```bash
# Migrate from npx skills
skillctl import from-npx --dry-run
skillctl import from-npx --adopt --write-manifest

# Security scan (CI-friendly)
skillctl audit --json --strict

# Re-fetch and re-sync
skillctl update
```

See the [docs site](https://skillctl.github.io/skillctl/) for the full command reference, config schema, Windows notes, and coexistence with other tools.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Run the CLI locally: `node packages/cli/bin/skillctl.js --help`

Architecture and design: [skillctl-design.md](./skillctl-design.md) · Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

[MIT](./LICENSE) — Copyright (c) 2026 skillctl contributors