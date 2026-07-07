# skillctl commands

| Command | Purpose |
|---------|---------|
| `init` | Create `agent-skills.json`; `--with-skill` adds meta-skill from GitHub |
| `add <spec>` | Resolve + materialize skill; update lock (and manifest by default) |
| `install` / `i` | Install all manifest deps into canonical store; optional sync |
| `sync` | Re-link canonical skills to enabled agent directories |
| `list` | Show lock/manifest entries |
| `remove <name>` | Remove from lock/manifest; `--purge` deletes canonical copy |
| `update [names...]` | Re-fetch from specifiers |
| `doctor` | Environment, portability warnings, coexistence, audit summary |
| `audit` | Security scan on installed skills (`--json`, `--strict`) |
| `import from-project` | Migrate skills from agent project dirs |
| `import from-npx` | Migrate from `npx skills` layout |
| `import from-skillctl` | Migrate from Python skillctl repos |
| `skill validate [path]` | Lint a `SKILL.md` directory |

Common flags: `install --frozen`, `install --no-sync`, `doctor --fix`, `import --dry-run`, `sync --dry-run`.