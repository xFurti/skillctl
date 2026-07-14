# @skillctl/cli

See the [root README](../../README.md) and [docs site](https://xfurti.github.io/skillctl/) for full documentation.

Universal package manager for [Agent Skills](https://agentskills.io). v0.8.0 adds a shared lock-compatible skill parser, provider-aware discovery, managed backup commands, plugin dry-run inspection, versioned artifacts, field-aware secret redaction, and advanced offline audit while preserving lock schema 1.0.

All first-party `--json` commands use the schema-1 skillctl envelope. Release candidates are tested from their packed tarballs and again from npm on Windows, macOS, and Linux.

```bash
skillctl search typescript --provider skills.sh
skillctl info skills.sh/vercel-labs/skills/find-skills
skillctl outdated
skillctl update --dry-run
skillctl audit --format sarif --output results.sarif
skillctl backup list --json
skillctl plugin add npm:@example/plugin@^1 --dry-run
skillctl completion powershell
```
