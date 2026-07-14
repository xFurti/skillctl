---
name: skillctl
description: >
  Manage Agent Skills with the skillctl CLI: search, info, add, install,
  outdated, update, sync, import, audit, plugins, completion, and portable manifest/lock workflows across Claude, Cursor, Codex,
  Grok, Gemini, Pi, and OpenCode. Use when the user mentions skillctl,
  agent-skills.json, agent-skills.lock, syncing skills, importing from npx
  skills, or skill portability across machines.
---

# skillctl

Operational playbook for managing Agent Skills with the **skillctl** CLI. Run real commands; do not simulate output or copy `SKILL.md` files between agent directories by hand.

## Golden rules

1. **Choose the intended scope** — project skills live in `.skillctl/skills/<name>/`; explicit personal skills added with `-g` live in `~/.skillctl/skills/<name>/`.
2. **Commit project state** — track `agent-skills.json`, `agent-skills.lock`, and vendored `.skillctl/skills/` content required by local/imported entries.
3. **Use portable specifiers** — prefer `github:`, `npm:`, `skills.sh/`, or project-relative `file:./<path>`; never commit absolute machine paths.
4. **Install before sync** — `install` materializes project dependencies; `sync` only refreshes agent targets.
5. **Verify after changes** — run `skillctl doctor` and `skillctl audit`; use `audit --strict` in CI.
6. **Import rather than copy by hand** — plain `skillctl import` discovers agent directories, deduplicates identical skills, and vendors selected content into the project store.
7. **Plan maintenance before writing** — use `outdated` or `update --dry-run`; use `--latest --save --yes` only when intentionally changing an npm constraint.
8. **Never replace unmanaged targets implicitly** — replacement requires exact skill, agent, scope, confirmation, and a backup.

## Decision tree

| Situation | Command |
|-----------|---------|
| New project, no manifest | `skillctl init` or `skillctl init --with-skill` |
| Add a project dependency | `skillctl add <specifier>` then `skillctl install` |
| Add a personal skill outside a project | `skillctl add -g <specifier>` |
| Skills already in `.claude/skills`, `.codex/skills`, etc. | `skillctl import --dry-run` then `skillctl import` |
| Migrating from `npx skills` | `skillctl import from-npx` |
| Re-link project targets | `skillctl sync --project` |
| Re-link personal targets | `skillctl sync --global` |
| Re-fetch project dependencies | `skillctl update` or `skillctl update <name>` |
| Discover or inspect a skill | `skillctl search <query>` / `skillctl info <name-or-specifier>` |
| Review pending updates | `skillctl outdated` / `skillctl update --dry-run` |
| CI reproducible install | `skillctl install --frozen` then `skillctl audit --strict` |
| Diagnose personal installation | `skillctl doctor -g` |

## Quick recipes

```bash
# Bootstrap a project
skillctl init --with-skill
skillctl add github:vercel-labs/agent-skills@main#web-design-guidelines
skillctl install

# Vendor a project-local skill
skillctl add file:./my-skill
skillctl install
skillctl sync --project

# Import existing agent directories
skillctl import --dry-run
skillctl import

# Personal/global skill
skillctl add -g file:./my-personal-skill
skillctl list -g
skillctl doctor -g

# Inspect a project
skillctl list
skillctl doctor
skillctl audit --json

# Discovery and maintenance
skillctl search typescript
skillctl info skills.sh/vercel-labs/skills/find-skills
skillctl outdated
skillctl update --dry-run
```

After a local add/import, expect the manifest and lock to use `file:./.skillctl/skills/<name>` and the lock `canonicalPath` to use `.skillctl/skills/<name>`. A global add uses `~/.skillctl/skills/<name>` and stores its state under `~/.skillctl/`.

## Reproducibility (0.6+)

- **Immutable remote lock:** GitHub and skills.sh resolve to a full commit SHA; npm resolves to an exact version and tarball integrity.
- **Project-portable:** remote specifiers and `file:./.skillctl/skills/<name>` with `canonicalPath: .skillctl/skills/<name>`.
- **Explicitly global:** `add -g`, `list -g`, `doctor -g`, and `remove -g`; do not use global scope for team dependencies.
- **Legacy:** `local:imported/<name>`, absolute local paths, and project entries with `canonicalPath: ~/.skillctl/skills/<name>` should be re-imported or re-added, then committed.
- `install --frozen` restores missing remote content from immutable lock entries without changing the lock.
- `update` is the normal operation that intentionally changes an existing remote resolution.
- `skills.sh/<owner>/<repo>/<skill>` locks the repository SHA plus a skill selector; frozen install does not query the catalog.

## Scoped sync and JSON

- No sync scope flags means project and global targets.
- Use `--project` or `--global`, plus repeatable/comma-separated `--agent` filters.
- `--prune` is opt-in and only removes verified skillctl-managed links/copies; combine it with `--dry-run` first.
- `--replace-unmanaged` requires `--skill`, `--agent`, one scope, and confirmation; it backs up the original content before replacement.
- First-party commands with `--json` emit one envelope. Exit codes: 0 success, 1 warning/partial result, 2 fatal/validation failure.

## Plugins, SARIF, and completion (0.7+)

- Plugins are experimental, integrity-locked, and execute Node.js with the user's permissions; they are not sandboxed.
- Prefer npm plugins. Local plugins require `plugin add <path> --allow-local`.
- `audit --format sarif --output results.sarif` writes GitHub-compatible SARIF while the default audit remains offline.
- `completion bash|zsh|powershell` prints a script and never edits a shell profile automatically.

## Failure modes

| Symptom | Action |
|---------|--------|
| Project `canonical path missing` | Run `skillctl install`; if the lock still uses the legacy global path, re-add/re-import the skill |
| Global `canonical path missing` | Run `skillctl doctor -g`, then re-add the personal skill if needed |
| Integrity mismatch | `skillctl update <name>` for remote content, or re-add/re-import changed local content |
| Symlink fails on Windows | Set config `defaultMode: copy`, then run `skillctl doctor --fix` |
| No project agents linked | `skillctl sync --project`; verify enabled agents in `~/.skillctl/config.json` |
| Frozen install failed | Fix manifest/lock drift; legacy mutable entries require `skillctl update <name>` |
| `mutable-resolution` | Run `skillctl update <name>` once to upgrade a legacy remote entry |
| `E_LOCK_TIMEOUT` | Wait for the other skillctl process or inspect stale locks with `doctor` |

## References

- [commands.md](references/commands.md) — full command cheat sheet
- [specifiers.md](references/specifiers.md) — specifier grammar
- [manifest-lock.md](references/manifest-lock.md) — manifest and lock semantics
- [workflows.md](references/workflows.md) — team onboarding, migration, CI
- [troubleshooting.md](references/troubleshooting.md) — doctor, Windows, coexistence
