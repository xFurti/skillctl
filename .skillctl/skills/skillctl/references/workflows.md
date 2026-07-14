# Workflows

## New project

```bash
skillctl init --with-skill
skillctl add <specifier>
skillctl install
git add agent-skills.json agent-skills.lock .skillctl/skills
```

Or use `skillctl init` without the meta-skill.

## Existing skills in agent folders

```bash
skillctl import --dry-run
skillctl import --select
# or import everything after reviewing the plan
skillctl import
```

Plain import discovers enabled agent directories, deduplicates identical content, and copies selected skills into `.skillctl/skills/`. Same-name content conflicts require `--interactive` or abort without changing project state.

## Team member clone

```bash
git clone <repo> && cd <repo>
skillctl install --frozen
skillctl sync --project
```

Remote entries are restored from immutable lock resolutions. Local/imported entries are restored from the committed `.skillctl/skills/<name>` content.

## Personal/global skills

```bash
skillctl add -g <specifier>
skillctl list -g
skillctl doctor -g
skillctl sync --global
```

Global state is machine-specific and is not a replacement for committed project dependencies.

## CI pipeline

```bash
npm install -g @skillctl/cli@0.8.0
skillctl install --frozen
skillctl audit --strict --json
```

Exit codes are 0 for success, 1 for warnings/partial results, and 2 for fatal or validation failures.

For GitHub code scanning, emit pure SARIF:

```bash
skillctl audit --format sarif --output results.sarif
```

## Discover and update

```bash
skillctl search typescript
skillctl info skills.sh/vercel-labs/skills/find-skills
skillctl outdated
skillctl update --dry-run
skillctl update selected-skill
```

Crossing an npm constraint is explicit: `skillctl update name --latest --save --yes`.

## Replace one unmanaged target

```bash
skillctl sync --project --agent codex --skill selected-skill --replace-unmanaged --dry-run
skillctl sync --project --agent codex --skill selected-skill --replace-unmanaged --yes
```

The original target is backed up under `.skillctl/backups/sync/` and restored automatically if replacement fails.

## Remove stale managed targets

```bash
skillctl sync --project --agent codex --prune --dry-run
skillctl sync --project --agent codex --prune
```

Prune never removes unverified user-managed directories.

## Add the skillctl meta-skill

```bash
skillctl add github:xFurti/skillctl#skills/skillctl
skillctl install
```

While developing this repository, use `skillctl add file:./skills/skillctl` and commit the refreshed manifest, lock, and `.skillctl/skills/skillctl` copy.
