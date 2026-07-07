# Workflows

## New project

```bash
skillctl init --with-skill
skillctl add <specifier>
skillctl install
git add agent-skills.json agent-skills.lock
```

Or without the meta-skill: `skillctl init` only.

## Existing skills in agent folders

```bash
skillctl import from-project --dry-run
skillctl import from-project
```

Uses `local:imported/<name>` specifiers pointing at canonical store.

## Team member clone

```bash
git clone <repo> && cd <repo>
skillctl install
skillctl sync
```

Lock paths are portable; install resolves `~/.skillctl/skills/<name>` per machine.

## CI pipeline

```bash
npm install -g @skillctl/cli
skillctl install --frozen
skillctl audit --strict --json
```

Exit codes: `doctor`/`audit` 2 on errors, 1 on warnings.

## Add skillctl meta-skill to a project

```bash
skillctl add github:xFurti/skillctl#skills/skillctl
skillctl install
```

Or in-repo: `skillctl add file:./skills/skillctl`.