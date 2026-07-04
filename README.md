# skillctl

Universal, package-manager-style CLI for managing **Agent Skills** across AI coding agents.

`skillctl` provides a single canonical store at `~/.skillctl/skills/` and automatically materializes skills (via symlinks, junctions, or copies) into the directories used by Claude Code, Cursor, OpenCode, Gemini CLI, Codex, and dozens of other agents.

> **Status**: Early scaffolding (v0). No functional commands yet. See roadmap in [skillctl-design.md](./skillctl-design.md).

## Installation (future)

```bash
npm install -g @skillctl/cli
# or
pnpm add -g @skillctl/cli
```

After install, `skillctl --help` and `skillctl --version` will be available. `npx skillctl` will also work thanks to the bin shim.

## Key Decision #1: Scoped npm Publication

**Primary published package**: `@skillctl/cli`

- `"name": "@skillctl/cli"` in [packages/cli/package.json](./packages/cli/package.json)
- `"bin": { "skillctl": "./bin/skillctl.js" }` — ensures:
  - `npm install -g @skillctl/cli` installs the `skillctl` command
  - `npx skillctl` resolves and runs it
  - `npm exec skillctl` works

**Unscoped `skillctl`**: Left unclaimed on npm.

**Rationale** (per design doc Key Decision #1 and Coexistence section):
- Avoids direct name collision on npm with existing `skillctl` packages (see below).
- Preserves the canonical `skillctl` user-facing command name.
- Scoped package makes ownership explicit and reduces hijack risk.
- Unscoped may be used later for a thin compatibility/deprecation shim after coordination with prior authors.

This decision is documented here and will be revisited in 0.2 based on community feedback.

## Prior Art & Name/Layout Collision Notice

This project acknowledges existing tools in the Agent Skills space:

- **Python `skillctl`** (direct name and `~/.skillctl/` collision): https://skillctl.xyz/ (PyPI `skillctl`), GitHub [dvlshah/skillctl](https://github.com/dvlshah/skillctl) and [r3b1s/skillctl](https://github.com/r3b1s/skillctl). Uses `~/.skillctl/repos/`, clone + symlink + manifest flows.
- **`npx skills`** (vercel-labs/skills, also antfu/skills-cli): Primary distribution mechanism today. Implements sophisticated multi-agent detection, symlink/copy logic (including Windows junctions), `skills-lock.json`, and support for 60+ agents via `.agents/skills` de-facto layout and per-agent dirs (`.claude/skills/`, `.cursor/skills/`, etc.).
- Other: `gh skill`, agent-skills-cli, skillbook, openskills, npm-agentskills.

`skillctl` (this project) is positioned as a **complementary management layer**:
- Adds declarative `agent-skills.json` + pnpm-style YAML `agent-skills.lock` for reproducibility.
- Stronger provenance, audit, plugin extensibility.
- Single canonical `~/.skillctl/skills/` source of truth (while supporting `.agents/skills` and others as *targets* via adapters).
- Does **not** aim to replace `npx skills` or Python skillctl; it detects and offers import/migration paths.

See full analysis in [skillctl-design.md](./skillctl-design.md) (Interop, Coexistence & Migration Strategy, Alternatives).

**Warning for early users**: Name collision risk exists on the command line and `~/.skillctl/`. Install via the scoped package (`@skillctl/cli`) and review `doctor` output (future) for detected prior installs.

## Vision

One canonical store (`~/.skillctl/skills/`) + project manifests (`agent-skills.json`) + automatic sync to every detected agent via adapters.

Treated like `pnpm`/`npm` but for skills: versioned, locked, auditable, cross-agent.

## Current Status (PR 1)

This is the initial scaffolding PR:

- pnpm monorepo + TypeScript (ESM, Node >=20)
- `@skillctl/cli` package with Commander-based skeleton
- Runnable `skillctl --version` / `--help` after `pnpm build`
- Basic CI matrix (Linux/macOS/Windows, Node 20+)
- MIT license, contribution basics
- README documents prior art and Key Decision #1

No commands, no adapters, no core functionality yet. Those arrive in subsequent PRs.

## Development

```bash
# Bootstrap
pnpm install

# Build
pnpm build

# Run the CLI (via local package bin)
pnpm --filter @skillctl/cli exec -- node ./bin/skillctl.js --help
# or directly
node packages/cli/bin/skillctl.js --version

# Type check
pnpm --filter @skillctl/cli lint
```

## License

MIT

## Contributing

See CONTRIBUTING.md (to be added in a later PR) and design doc.

Issues and PRs welcome. Start with adapters or registry sources once core is in place.
