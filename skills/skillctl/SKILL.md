---
name: skillctl
description: >
  Manage Agent Skills with the skillctl CLI: init, add, install, sync, import,
  audit, and portable manifest/lock workflows across Claude, Cursor, Codex,
  Grok, Gemini, and OpenCode. Use when the user mentions skillctl,
  agent-skills.json, agent-skills.lock, syncing skills, importing from npx
  skills, or skill portability across machines.
---

# skillctl

Operational playbook for managing Agent Skills with the **skillctl** CLI. Run real commands; do not simulate output or copy `SKILL.md` files between agent directories by hand.

## Golden rules

1. **One canonical store** — skills live in `~/.skillctl/skills/<name>/`; agents get symlinks via `sync`.
2. **Commit manifest + lock** — track `agent-skills.json` and `agent-skills.lock` in git for team reproducibility.
3. **Portable specifiers only** — use `file:./<path>`, `local:imported/<name>`, `github:`, `npm:`, or `skills.sh/`; never commit absolute homedir paths.
4. **Install before sync** — `install` materializes the store; `sync` only re-links agents.
5. **Verify after changes** — run `skillctl doctor` (and `skillctl audit` in CI).
6. **Prefer import over manual copy** — use `import from-project` or `import from-npx` instead of duplicating skill folders.

## Decision tree

| Situation | Command |
|-----------|---------|
| New project, no manifest | `skillctl init` or `skillctl init --with-skill` |
| Add a remote or local skill | `skillctl add <specifier>` then `skillctl install` |
| Skills already in `.claude/skills`, `.codex/skills`, etc. | `skillctl import from-project` |
| Migrating from `npx skills` | `skillctl import from-npx` |
| Re-link only (lock unchanged) | `skillctl sync` |
| Re-fetch from upstream | `skillctl update` or `skillctl update <name>` |
| CI reproducible install | `skillctl install --frozen` then `skillctl audit --strict` |
| Non-portable paths in lock | `skillctl install` to rewrite; check `skillctl doctor` warnings |

## Quick recipes

```bash
# Bootstrap
skillctl init --with-skill
skillctl add github:vercel-labs/agent-skills@main#web-design-guidelines
skillctl install

# Project-local skill
skillctl add file:./my-skill
skillctl install
skillctl sync

# Import existing agent dirs
skillctl import from-project --dry-run
skillctl import from-project

# Inspect
skillctl list
skillctl doctor
skillctl audit --json
```

Expected after `add file:./my-skill` + `install`: manifest specifier `file:./my-skill`, lock `canonicalPath` like `~/.skillctl/skills/my-skill`.

## Reproducibility (0.5+)

- **Immutable remote lock:** GitHub and skills.sh resolve to a full commit SHA; npm resolves to an exact version and tarball integrity.
- **Portable:** `file:./rel`, remote specifiers, `canonicalPath: ~/.skillctl/skills/<name>`.
- **Machine-local:** `local:imported/<name>` is portable text but cannot restore a missing canonical copy on a new machine.
- **Not portable:** absolute `file:/Users/...`, `local:/abs/path`, absolute `canonicalPath` from another machine.
- `install --frozen` restores a missing or corrupt store from immutable lock entries without changing the lock.
- `update` is the normal operation that changes an existing valid resolution.

## Scoped sync and JSON

- No sync scope flags means project and global targets, as before.
- Use `--project` or `--global`, plus repeatable/comma-separated `--agent` filters.
- `--prune` is opt-in and only removes verified skillctl-managed links/copies; combine with `--dry-run` first.
- First-party commands with `--json` emit one envelope. Exit codes: 0 success, 1 warning/partial result, 2 fatal/validation failure.

## Failure modes

| Symptom | Action |
|---------|--------|
| `canonical path missing` | `skillctl install --frozen` when the lock is immutable |
| Integrity mismatch | `skillctl update <name>` or `skillctl install` |
| Symlink fails (Windows) | `doctor` notes; config `defaultMode: copy` |
| No agents linked | `skillctl sync`; enable agents in `~/.skillctl/config.json` |
| `Frozen install failed` | Fix manifest/lock drift; a missing store alone is restored from the lock |
| `mutable-resolution` | Run `skillctl update <name>` once to upgrade a legacy lock entry |
| `E_LOCK_TIMEOUT` | Wait for the other skillctl process or inspect stale locks with `doctor` |

## References

- [commands.md](references/commands.md) — full command cheat sheet
- [specifiers.md](references/specifiers.md) — specifier grammar
- [manifest-lock.md](references/manifest-lock.md) — manifest and lock semantics
- [workflows.md](references/workflows.md) — team onboarding, migration, CI
- [troubleshooting.md](references/troubleshooting.md) — doctor, Windows, coexistence
