# Leogriel CLI (`@leogriel/cli`)

See the [root README](../../README.md) and [docs site](https://xfurti.github.io/leogriel/) for full documentation.

Leogriel weaves [Agent Skills](https://agentskills.io) into every workflow with reproducible discovery, installation, synchronization, audit, and testing. v1.0.0-beta.2 adds experimental paired behavioral testing with an isolated Codex runner while retaining the 0.8 lock-compatible parser, backup, audit, artifact, and redaction foundations.

All first-party `--json` commands use the schema-1 leogriel envelope. Release candidates are tested from their packed tarballs and again from npm on Windows, macOS, and Linux.

Leogriel replaces the former `@skillctl/cli` package and `skillctl` command. Project manifests and locks keep their existing filenames; see the root README for legacy state compatibility and migration instructions.

```bash
leogriel search typescript --provider skills.sh
leogriel info skills.sh/vercel-labs/skills/find-skills
leogriel outdated
leogriel update --dry-run
leogriel audit --format sarif --output results.sarif
leogriel backup list --json
leogriel plugin add npm:@example/plugin@^1 --dry-run
leogriel test init my-skill
leogriel test validate
leogriel test my-skill --runs 3 --model <model> --json
leogriel completion powershell
```
