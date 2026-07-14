# @skillctl/cli

See the [root README](../../README.md) and [docs site](https://xfurti.github.io/skillctl/) for full documentation.

Universal package manager for [Agent Skills](https://agentskills.io). v0.7.3 adds skills.sh discovery and inspection, outdated/update planning, safe target reconciliation, experimental integrity-locked plugins, SARIF audit output, and shell completion while preserving lock schema 1.0.

```bash
skillctl search typescript
skillctl info skills.sh/vercel-labs/skills/find-skills
skillctl outdated
skillctl update --dry-run
skillctl audit --format sarif --output results.sarif
skillctl completion powershell
```
