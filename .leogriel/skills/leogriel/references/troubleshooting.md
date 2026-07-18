# Troubleshooting

## Legacy project paths after upgrading to 0.6

Older project locks may contain `canonicalPath: ~/.leogriel/skills/<name>` or `local:imported/<name>`. Re-add local sources or run plain `leogriel import` for agent-directory content, verify the generated `.leogriel/skills/<name>` copy, and commit the updated manifest, lock, and vendored content.

## Integrity mismatch

The installed tree differs from the lock hash. Use `leogriel update <name>` for remote dependencies. For intentionally changed local content, re-run `leogriel add file:./path/to/source` and commit the refreshed project state.

## Mutable legacy resolution

`doctor` reports `mutable-resolution` for an older GitHub branch/tag/HEAD or incomplete npm entry. Run `leogriel update <name>` and commit the additive lock change. Frozen install rejects the mutable entry.

## Lock contention or interrupted transaction

Mutating commands serialize project then store access. `E_LOCK_TIMEOUT` means another operation held a lock for 10 seconds. `doctor` reports transaction journals and lock files older than the 30-second stale threshold; the next mutating command attempts recovery.

## Windows symlinks

Symlinks may require Developer Mode or administrator privileges. Set `defaultMode: "copy"` in `~/.leogriel/config.json`, then run `leogriel doctor --fix`.

## Coexistence with npx skills or Python skillctl

`doctor` may detect `.agents/skills`, `skills-lock.json`, or `~/.skillctl/repos`. Use plain `leogriel import` for project agent directories, `leogriel import from-npx`, or `leogriel import from-skillctl`; avoid double-managing the same targets.

## Scope confusion

- Project commands discover the nearest parent containing `agent-skills.json` and use `.leogriel/skills`.
- Personal operations are explicit: `add -g`, `list -g`, `doctor -g`, and `remove -g`.
- `sync --project` and `sync --global` restrict link targets; without either flag sync covers both scopes represented by the project lock.

## Version compatibility

This skill targets **leogriel 1.0.0-beta.2**. Lock schema remains 1.0 and config remains version 1. Older locks remain readable, but legacy mutable remote entries require `update`, and pre-0.6 local/global project paths should be re-added or re-imported into the project store.

Catalog network failures use a cached result when available and mark it stale. Without cache, retry later or verify `LEOGRIEL_SKILLS_API_URL`. Plugin integrity/API failures appear in `leogriel plugin doctor`; reinstall the trusted package rather than editing its locked store.
