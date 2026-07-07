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
skillctl add github:vercel-labs/agent-skills#web-design-guidelines
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

## Portability (0.3.1+)

- **Portable:** `file:./rel`, `local:imported/<name>`, remote specifiers, `canonicalPath: ~/.skillctl/skills/<name>`.
- **Not portable:** absolute `file:/Users/...`, `local:/abs/path`, absolute `canonicalPath` from another machine.
- If `doctor` warns about non-portable paths, run `skillctl install` to rewrite lock from manifest.

## Failure modes

| Symptom | Action |
|---------|--------|
| `canonical path missing` | `skillctl install` |
| Integrity mismatch | `skillctl update <name>` or `skillctl install` |
| Symlink fails (Windows) | `doctor` notes; config `defaultMode: copy` |
| No agents linked | `skillctl sync`; enable agents in `~/.skillctl/config.json` |
| `Frozen install failed` | Store out of sync; run `install` without `--frozen` |

## References

- [commands.md](references/commands.md) — full command cheat sheet
- [specifiers.md](references/specifiers.md) — specifier grammar
- [manifest-lock.md](references/manifest-lock.md) — manifest and lock semantics
- [workflows.md](references/workflows.md) — team onboarding, migration, CI
- [troubleshooting.md](references/troubleshooting.md) — doctor, Windows, coexistence