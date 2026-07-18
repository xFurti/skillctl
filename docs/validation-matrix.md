# Leogriel 1.0 validation matrix

This is the evidence checklist for `1.0.0-rc.1` and stable. A checked implementation item is not equivalent to completed external validation. Live runner validation is local and opt-in; Leogriel does not require maintainers or collaborators to place model credentials in GitHub Actions.

## Current evidence

| Area | Evidence in the current repository | Status |
|---|---|---|
| Standard build/type/test | Windows local gates and cross-platform CI on Node 22.13/24 | Automated |
| Packed/npm smoke | Pre-publish tarball smoke and post-publish registry smoke on Windows, macOS, Linux | Automated; beta.3 registry run completed |
| JSON contracts | First-party commands, subcommands, errors, invalid options, completion payload | Automated |
| Release idempotency | SRI comparison, partial-publication continuation, conflict refusal | Automated |
| Git comparison | Safe immutable materialization plus paired reference/candidate tests | Automated locally; external repository pending |
| Optional GitHub Action | Report renderer, Job Summary, artifacts, badge data, comment upsert, fail-after-report ordering | Automated locally; not an RC requirement |
| Codex runner | Fake-process contracts; the dedicated ChatGPT profile preflight and an exact-model no-tool run succeeded on Windows, while the terminal live smoke failed closed at elevated Windows sandbox launch | Windows terminal evidence blocked by the local sandbox prerequisite; one Unix-like host pending |
| Claude runner | Fake-process contracts for version/platform, sandbox settings, credential filtering, JSONL, stdin, redaction, failure semantics | Real macOS/Linux/WSL2 run pending |
| External repositories | None documented after the new runner changes | Pending |

## Local beta.3 CLI validation

On 2026-07-18, the published `@leogriel/cli@1.0.0-beta.3` package was installed into an isolated Windows test directory and exercised without using the repository workspace as its project state. The run covered:

- namespaced catalog search and selected `skills.sh` resolution;
- GitHub resolution pinned to a commit, including a repository with an unrelated root symlink;
- npm skill resolution with exact version and SRI provenance;
- add, list, read-only info, frozen restore, outdated, and update dry-run;
- project sync to multiple adapters;
- import dry-run and import of an existing agent skill;
- unmanaged-target replacement, backup listing/info, and restore dry-run;
- offline audit and behavioral test YAML init/list/validation.

The validation found regressions in coexistence detection, non-interactive meta-skill initialization, strict-audit exit severity, npm info provenance rendering, and GitHub subpath extraction on Windows. Regression fixes are kept in the next corrective beta candidate; this section does not claim that those fixes are present in beta.3. The real paired Codex terminal smoke remains unsatisfied because the required elevated Windows sandbox could not launch in the validation environment.

## Evidence record

For every live or external validation, record the repository, commit, operating system, Node version, Leogriel commit/package version, runner CLI version, exact model ID, test integrity, skill integrity, result artifact, executor, and date. Do not record credentials, authentication-profile contents, or retained runner homes.

Live checks run from a trusted local clone with the opt-in commands in `docs/behavioral-testing.md`. A collaborator may share the redacted result artifact and command output; a hosted workflow URL is not required.

## Mandatory RC matrix

| Scenario | Ubuntu | macOS | Windows |
|---|---:|---:|---:|
| Standard gates, Node 22.13 | Required | Required | Required |
| Standard gates, Node 24 | Required | Required | Required |
| Codex live smoke, network deny | At least one of Ubuntu/macOS | At least one of Ubuntu/macOS | Required |
| Claude live smoke, network deny | At least one of Ubuntu/macOS | At least one of Ubuntu/macOS | Fail-closed detection only |
| Git comparison on an external repository | Required on one Unix-like host | Optional | Required |
| Packed tarball smoke | Required | Required | Required |
| Post-publish npm smoke | Required | Required | Required |

The optional composite GitHub Action may be validated on a controlled repository, but it does not replace local runner validation and does not block the RC.

At least two external repositories must be used:

1. one small fixture-style Agent Skill repository;
2. one real repository not maintained as part of Leogriel.

Mixed results, unavailable runner features, unpinned models, missing final events, timeouts, or incomplete reports do not satisfy a live cell.

## Stable-release gate

`1.0.0` remains blocked until:

- every mandatory RC cell has retained redacted evidence;
- `1.0.0-rc.1` has been used in external repositories;
- both runners have successful real paired runs on supported hosts, or an unvalidated runner is removed from the stable promise;
- public-contract and migration docs match the shipped package;
- no unresolved severity-error audit finding exists;
- release rerun behavior has been exercised after a controlled partial publication;
- RC feedback has no unresolved compatibility blocker.

Fixes may ship as additional beta or RC builds. The project does not skip directly from the current beta to stable.
