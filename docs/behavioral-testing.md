# Behavioral testing (experimental, 1.0 beta)

This document describes the `1.0.0-beta.3` candidate behavior. The testing package and AgentRunner API remain unstable until RC validation.

`leogriel test` compares paired executions of the same task without and with one exact skill. Tests run sequentially. Each variant receives a clean workspace and separate temporary HOME, USERPROFILE, XDG configuration/data/cache, and runner configuration directories.

```yaml
version: 1
skill: example
cases:
  - name: writes-output
    prompt: Create output.txt containing ready.
    network:
      mode: deny
      webSearch: disabled
    budget:
      maxDurationMs: 120000
      maxChangedFiles: 3
    assertions:
      - type: file-exists
        path: output.txt
      - type: file-contains
        path: output.txt
        contains: ready
```

Network access is denied and web search is disabled unless enabled explicitly. `mode: allow` does not enable web search; select `cached` or `live` separately. The effective policy is recorded in results.

Fixtures must not contain undeclared agent configuration (`.codex`, `.claude`, `.agents`, `.cursor`, `.gemini`, `.grok`, `.opencode`, `.pi`, agent-specific skills, `AGENTS.md`, `AGENTS.override.md`, or `CLAUDE.md`). Symlinks are rejected. The runner installs only the skill under test after validation.

API-key authentication accepts `CODEX_API_KEY` or `OPENAI_API_KEY`. Equal values are accepted with Codex precedence; conflicting values stop with exit code 2. Keys are not copied to a workspace, CODEX_HOME, report, or artifact. Agent tool subprocesses receive only the safe operating-system environment required to find executables and use the isolated HOME and temporary directories; API keys remain excluded.

Live runs may instead set `LEOGRIEL_CODEX_AUTH_MODE=chatgpt` and an explicit `LEOGRIEL_CODEX_AUTH_HOME` pointing to a dedicated profile previously authenticated with `codex login`. leogriel never falls back to the normal `~/.codex`, runs `codex login status` before execution, and rejects ChatGPT mode when either API-key variable is present. The dedicated profile is used only by the Codex process for authentication: user configuration and rules remain disabled, its files are never copied, logged, redacted, changed, or deleted by leogriel, and HOME/USERPROFILE/XDG/workspace isolation remains temporary and distinct.

Native Windows Codex runs require the elevated Windows sandbox. Leogriel requests it explicitly and fails closed if it is unavailable; it does not fall back to the weaker unelevated sandbox.
When the Codex desktop launcher is separate from its sandbox helpers, Leogriel selects the newest complete standalone Codex installation under the local package cache. This discovery uses executable resources only; authentication and configuration still come exclusively from the explicitly selected isolated or dedicated CODEX_HOME.

`--agent claude` selects the second experimental runner. It requires Claude Code 2.1.187 or newer, `ANTHROPIC_API_KEY`, and macOS, Linux, or WSL2. Native Windows fails closed. The runner uses `--bare`, an isolated `CLAUDE_CONFIG_DIR`, no session persistence, an empty strict MCP configuration, a restricted built-in tool list, mandatory native sandboxing, disabled unsandboxed-command fallback, and credential removal from Bash subprocesses. `webSearch` must remain `disabled`; no weaker configuration is selected if Claude Code rejects the requested policy. Bare mode disables native skill discovery, so Leogriel explicitly tells the runner to read the exact staged `SKILL.md`; its directory remains available for referenced files and assets.

Command assertions execute arbitrary code even without a shell. TTY runs display executable, argv, and working directory for one confirmation. CI requires `--trust-tests`; this flag does not change the runner network policy or provide a security sandbox, and the executable may still use capabilities available to the host process.

The beta runner is always paired; there is no unpaired baseline option. An improvement or regression requires at least two transitions in the same direction and none in the opposite direction. Every required assertion and budget determines the test-case pass/fail result. Durations and tokens are secondary metrics. If no model is pinned, the result warns that it is paired-valid for the current execution but not stably comparable across dates or environments.

## Git regression comparison

`leogriel test <skill> --compare <git-ref>` compares the current skill against the same repository path at the immutable commit resolved from the ref. The reference skill becomes the paired baseline; the current working-tree skill remains the candidate. Leogriel rejects symlinks, escaping paths, oversized Git objects, missing skills, and mismatched skill names while materializing the reference in a temporary directory.

The current test YAML and fixtures are applied to both variants. Results record `requestedRef`, the resolved 40-character commit, `referenceIntegrity`, and `candidateIntegrity`. Temporary Git content is removed after the run, including error paths.

`--keep-workspace` retains only workspaces under `.leogriel/artifacts/test/`; they may contain sensitive files or output generated by the agent. HOME/XDG and runner configuration directories are always deleted. This isolation reduces configuration leakage but is not an absolute security sandbox.

## Opt-in live Codex smoke

The live smoke is excluded from the standard suite and runs locally from a trusted clone. Maintainers and collaborators do not need to place model credentials in GitHub Actions. It requires an exact pinned model and either API-key authentication or the explicit dedicated ChatGPT profile below. It runs with outbound network denied and web search disabled, verifies the requested file, checks that Codex itself can run Node.js, and removes its complete temporary isolation root without modifying the authentication profile.

```powershell
$env:LEOGRIEL_LIVE_CODEX = "1"
$env:LEOGRIEL_LIVE_MODEL = "<exact-model-id>"
$env:LEOGRIEL_CODEX_AUTH_MODE = "chatgpt"
$env:LEOGRIEL_CODEX_AUTH_HOME = "$env:USERPROFILE\.codex-leogriel-live"

pnpm --filter @leogriel/testing test:live
```

Set `LEOGRIEL_LIVE_DEBUG=1` to print redacted runner diagnostics even when the smoke succeeds. A failure always prints the exit state, truncation/timeout state, requested and resolved models, JSONL event types, final agent message, stderr, and the workspace file list. Set `LEOGRIEL_LIVE_KEEP_WORKSPACE=1` to retain only a failed workspace under `.leogriel/artifacts/test/live/`; successful workspaces are still deleted. The dedicated ChatGPT CODEX_HOME and the temporary HOME/XDG trees are never copied or retained. The live smoke performs one attempt only and never retries automatically.

The Claude smoke is also opt-in and runs the same Node/file proof through Claude Code:

```bash
LEOGRIEL_LIVE_CLAUDE=1 \
LEOGRIEL_LIVE_CLAUDE_MODEL=<exact-model-id> \
ANTHROPIC_API_KEY=[SEGRETO RIMOSSO] \
pnpm --filter @leogriel/testing test:live
```

It must be run on macOS, Linux, or WSL2 with the Claude Code sandbox prerequisites installed.
