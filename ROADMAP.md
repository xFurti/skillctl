# Roadmap to leogriel 1.0

There will be no `0.10.0`. After `0.9.0`, the project may ship focused `0.9.1` and `0.9.2` fixes, followed by `1.0.0-alpha` or `1.0.0-beta` builds when public contracts still need iteration. At least `1.0.0-rc.1` is mandatory before stable.

## Required before 1.0

- `leogriel test --compare <git-ref>` and repeatable regression testing.
- An official GitHub Action with GitHub Job Summary, Markdown/HTML reports, downloadable artifacts, badges, and pull-request comments.
- Stable manifest, lock, artifact, test YAML, JSON envelope, plugin, catalog, audit, and AgentRunner contracts with migration guides.
- At least two reliable AgentRunner implementations with capability detection and fail-closed isolation.
- Real test programs across external repositories, operating systems, and runner versions.
- Complete English and Italian documentation, security guidance, compatibility guarantees, and migration instructions.

`1.0.0` is released only after those contracts are verified in external repositories with at least two runners. Pre-releases do not imply API stability for `@leogriel/testing`.
