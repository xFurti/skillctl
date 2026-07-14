# skillctl commands

| Command | Purpose |
|---------|---------|
| `init` | Create `agent-skills.json`; `--with-skill` adds the first-party meta-skill |
| `add <spec>` | Resolve and vendor a project skill; update manifest and lock |
| `add -g <spec>` | Install and sync an explicit personal/global skill |
| `install` / `i` | Install project manifest dependencies into `.skillctl/skills`; sync by default |
| `sync` | Refresh managed agent targets; filter scope/agent and optionally prune |
| `list` / `list -g` | Show project or global entries |
| `remove <name>` | Remove a project entry; `--purge` also deletes its vendored content |
| `remove -g <name>` | Remove a global entry and personal agent targets |
| `update [names...]` | Re-fetch project dependencies from their manifest specifiers |
| `search [query]` | Search catalogs; select one with `--provider` and optionally add an exact result |
| `info <name-or-specifier>` | Inspect installed state or a remote source without modifying state |
| `outdated [names...]` | Produce a deterministic update plan |
| `doctor` / `doctor -g` | Diagnose project or global state, links, config, coexistence, and audit summary |
| `audit` | Offline security scan (`--json`, `--strict`, or SARIF output) |
| `import` | Discover, deduplicate, select, and vendor skills from project agent directories |
| `import from-npx` | Migrate from the `npx skills` layout |
| `import from-skillctl` | Migrate from Python skillctl repositories |
| `skill validate [path]` | Lint a `SKILL.md` directory |
| `plugin ...` | Manage experimental npm/local plugins with manifest and lock state |
| `completion <shell>` | Print Bash, Zsh, or PowerShell completion |
| `backup list/info/restore/remove` | Inspect and explicitly reconcile managed sync backups |

Common flags: `search --provider skills.sh`, `install --frozen`, `update --dry-run`, `update --latest --save --yes`, `doctor --fix`, `sync --project`, `sync --agent codex`, `sync --skill name`, `sync --replace-unmanaged --yes`, `plugin add --dry-run`, `backup restore --dry-run`, `audit --format sarif --output results.sarif`, and `import --dry-run`.

Commands exposing `--json` emit one stable envelope and use exit code 0 for success, 1 for warnings/partial results, and 2 for fatal or validation errors.
