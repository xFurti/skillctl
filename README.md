# skillctl

<p align="center">
  <img src="brand/skillctl-banner-animated.gif" alt="skillctl — Universal package manager for Agent Skills" width="100%">
</p>

Universal, package-manager-style CLI for managing **Agent Skills** across AI coding agents.

`skillctl` keeps a single canonical store at `~/.skillctl/skills/` and syncs skills (symlink, junction on Windows, or copy) into Claude Code, Cursor, OpenCode, Codex, Gemini CLI, Grok, and other [agentskills.io](https://agentskills.io)-compatible agents.

> **Status**: v0.4.0 on npm — first-party **skillctl** meta-skill, Grok adapter, `skill validate`, `init --with-skill`. See [CHANGELOG.md](./CHANGELOG.md).

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
skillctl add vercel-labs/agent-skills#web-design-guidelines
skillctl add npm:some-skill-pkg
skillctl add file:./my-skill
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
| Grok | `.grok/skills` | `~/.grok/skills` |

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
# Import skills already in agent directories (.codex/skills, .claude/skills, ...)
skillctl import from-project --dry-run
skillctl import from-project

# Migrate from npx skills
skillctl import from-npx --dry-run
skillctl import from-npx --sync --write-manifest

# Security scan (CI-friendly)
skillctl audit --json --strict

# Re-fetch and re-sync
skillctl update
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

## Authors

- [xFurti](https://github.com/xFurti)
- [Gabry848](https://github.com/gabry848)

## License

[MIT](./LICENSE) — Copyright (c) 2026 xFurti, Gabry848