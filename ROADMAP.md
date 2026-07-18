# Roadmap to Leogriel 1.0

Leogriel does not skip directly from beta to stable. The current published prerelease is `1.0.0-beta.3`; corrective beta releases may precede at least `1.0.0-rc.1`, followed by `1.0.0` only after real external use.

## Beta.3 consolidation

- [x] Git-ref paired comparison and immutable reference materialization.
- [x] Optional GitHub-native reports and pull-request comments.
- [x] Codex plus fail-closed experimental Claude runner.
- [x] Complete plain-import JSON output and target-drift diagnostics.
- [x] Local opt-in live validation without hosted model credentials.
- [x] Current architecture separated from archived skillctl design.
- [ ] Final documentation, package, pack, and cross-platform CI gates.

## Required before RC

- [x] Publish beta.3 through the normal pre-publish and registry smoke gates.
- [ ] Validate Codex locally on Windows and at least one Unix-like host with an exact model.
- [ ] Validate Claude locally on a supported macOS, Linux, or WSL2 host, or remove it from the stable promise.
- [ ] Exercise Git comparison in two external repositories with redacted evidence.
- [ ] Have at least two operators install and use the prerelease from npm.
- [ ] Decide which of the twelve workspace packages receive stable public API guarantees.
- [ ] Add repository security policy and complete the bilingual documentation review.
- [ ] Raise targeted coverage for npm/tarball resolution, update, backup, import, plugin, and audit paths.

## RC and stable

- [ ] Publish and use at least `1.0.0-rc.1`.
- [ ] Verify manifest, lock, config, JSON, artifact, audit, catalog, plugin, and AgentRunner contracts against the shipped package.
- [ ] Exercise release rerun behavior after a controlled partial publication.
- [ ] Resolve all compatibility blockers and error-severity audit findings.
- [ ] Publish `1.0.0` with npm `latest`, an annotated Git tag, complete release notes, and the stable `v1` Action alias if the optional Action remains supported.

`@leogriel/testing`, the plugin API, Claude runner, and composite Action remain experimental until their contracts satisfy the RC evidence matrix.
