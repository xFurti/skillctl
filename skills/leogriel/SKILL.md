---
name: leogriel
description: >
  Manage Agent Skills with the leogriel CLI: search, info, add, install,
  outdated, update, sync, import, audit, plugins, behavioral tests, completion, and portable manifest/lock workflows across Claude, Cursor, Codex,
  Grok, Gemini, Pi, and OpenCode. Use when the user mentions leogriel,
  agent-skills.json, agent-skills.lock, syncing skills, importing from npx
  skills, or skill portability across machines.
---

# Leogriel

Operational playbook for managing Agent Skills with the **leogriel** CLI. Run real commands; do not simulate output or copy `SKILL.md` files between agent directories by hand.

## Golden rules

1. **Choose the intended scope** — project skills live in `.leogriel/skills/<name>/`; explicit personal skills added with `-g` live in `~/.leogriel/skills/<name>/`.
2. **Commit project state** — track `agent-skills.json`, `agent-skills.lock`, and vendored `.leogriel/skills/` content required by local/imported entries.
3. **Use portable specifiers** — prefer `github:`, `npm:`, `skills.sh/`, or project-relative `file:./<path>`; never commit absolute machine paths.
4. **Install before sync** — `install` materializes project dependencies; `sync` only refreshes agent targets.
5. **Verify after changes** — run `leogriel doctor` and `leogriel audit`; use `audit --strict` in CI.
6. **Import rather than copy by hand** — plain `leogriel import` discovers agent directories, deduplicates identical skills, and vendors selected content into the project store.
7. **Plan maintenance before writing** — use `outdated` or `update --dry-run`; use `--latest --save --yes` only when intentionally changing an npm constraint.
8. **Never replace unmanaged targets implicitly** — replacement requires exact skill, agent, scope, confirmation, and a backup.
9. **Treat behavioral tests as untrusted code** — pin a model when comparing over time, keep network denied unless required, and review every command assertion before using `--trust-tests`.

## Decision tree

| Situation | Command |
|-----------|---------|
| New project, no manifest | `leogriel init` or `leogriel init --with-skill` |
| Add a project dependency | `leogriel add <specifier>` then `leogriel install` |
| Add a personal skill outside a project | `leogriel add -g <specifier>` |
| Skills already in `.claude/skills`, `.codex/skills`, etc. | `leogriel import --dry-run` then `leogriel import` |
| Migrating from `npx skills` | `leogriel import from-npx` |
| Re-link project targets | `leogriel sync --project` |
| Re-link personal targets | `leogriel sync --global` |
| Re-fetch project dependencies | `leogriel update` or `leogriel update <name>` |
| Discover or inspect a skill | `leogriel search <query>` / `leogriel info <name-or-specifier>` |
| Review pending updates | `leogriel outdated` / `leogriel update --dry-run` |
| CI reproducible install | `leogriel install --frozen` then `leogriel audit --strict` |
| Diagnose personal installation | `leogriel doctor -g` |
| Compare behavior with and without a skill | `leogriel test <name> --runs 3 --model <model>` |

## Quick recipes

```bash
# Bootstrap a project
leogriel init --with-skill
leogriel add github:vercel-labs/agent-skills@main#skills/web-design-guidelines
leogriel install

# Vendor a project-local skill
leogriel add file:./my-skill
leogriel install
leogriel sync --project

# Import existing agent directories
leogriel import --dry-run
leogriel import

# Personal/global skill
leogriel add -g file:./my-personal-skill
leogriel list -g
leogriel doctor -g

# Inspect a project
leogriel list
leogriel doctor
leogriel audit --json

# Discovery and maintenance
leogriel search typescript
leogriel info skills.sh/vercel-labs/skills/find-skills
leogriel outdated
leogriel update --dry-run
```

After a local add/import, expect the manifest and lock to use `file:./.leogriel/skills/<name>` and the lock `canonicalPath` to use `.leogriel/skills/<name>`. A global add uses `~/.leogriel/skills/<name>` and stores its state under `~/.leogriel/`.

## Reproducibility (0.6+)

- **Immutable remote lock:** GitHub and skills.sh resolve to a full commit SHA; npm resolves to an exact version and tarball integrity.
- **Project-portable:** remote specifiers and `file:./.leogriel/skills/<name>` with `canonicalPath: .leogriel/skills/<name>`.
- **Explicitly global:** `add -g`, `list -g`, `doctor -g`, and `remove -g`; do not use global scope for team dependencies.
- **Legacy:** `local:imported/<name>`, absolute local paths, and project entries with `canonicalPath: ~/.leogriel/skills/<name>` should be re-imported or re-added, then committed.
- `install --frozen` restores missing remote content from immutable lock entries without changing the lock.
- `update` is the normal operation that intentionally changes an existing remote resolution.
- `skills.sh/<owner>/<repo>/<skill>` locks the repository SHA plus a skill selector; frozen install does not query the catalog.

## Scoped sync and JSON

- No sync scope flags means project and global targets.
- Use `--project` or `--global`, plus repeatable/comma-separated `--agent` filters.
- `--prune` is opt-in and only removes verified leogriel-managed links/copies; combine it with `--dry-run` first.
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
| Project `canonical path missing` | Run `leogriel install`; if the lock still uses the legacy global path, re-add/re-import the skill |
| Global `canonical path missing` | Run `leogriel doctor -g`, then re-add the personal skill if needed |
| Integrity mismatch | `leogriel update <name>` for remote content, or re-add/re-import changed local content |
| Symlink fails on Windows | Set config `defaultMode: copy`, then run `leogriel doctor --fix` |
| No project agents linked | `leogriel sync --project`; verify enabled agents in `~/.leogriel/config.json` |
| Frozen install failed | Fix manifest/lock drift; legacy mutable entries require `leogriel update <name>` |
| `mutable-resolution` | Run `leogriel update <name>` once to upgrade a legacy remote entry |
| `E_LOCK_TIMEOUT` | Wait for the other leogriel process or inspect stale locks with `doctor` |

## References

- [commands.md](references/commands.md) — full command cheat sheet
- [specifiers.md](references/specifiers.md) — specifier grammar
- [manifest-lock.md](references/manifest-lock.md) — manifest and lock semantics
- [workflows.md](references/workflows.md) — team onboarding, migration, CI
- [troubleshooting.md](references/troubleshooting.md) — doctor, Windows, coexistence
