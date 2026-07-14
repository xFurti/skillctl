# Contributing to skillctl

Thank you for your interest in contributing. This project is an open-source monorepo for managing [Agent Skills](https://agentskills.io) across AI coding agents.

**Authors:** [xFurti](https://github.com/xFurti), [Gabry848](https://github.com/gabry848)

## Before you start

- Read [README.md](./README.md) for usage, [docs site](https://xfurti.github.io/skillctl/) for CLI reference, and [skillctl-design.md](./skillctl-design.md) for architecture.
- Check [CHANGELOG.md](./CHANGELOG.md) for recent changes.
- **Name collision**: This project shares the CLI name `skillctl` and path `~/.skillctl/` with an existing [Python skillctl](https://skillctl.xyz/). We publish as `@skillctl/cli` on npm.

## Development setup

**Requirements:** Node.js >= 22.13, pnpm 11.x

```bash
git clone https://github.com/xFurti/skillctl.git
cd skillctl
pnpm install
pnpm build
pnpm test
pnpm -r lint
```

Run the CLI locally:

```bash
node packages/cli/bin/skillctl.js --help
# or link globally for development
cd packages/cli && pnpm link --global
```

## First-party meta-skill

Agent-facing instructions live in `skills/skillctl/`. After editing `SKILL.md` or `references/`:

```bash
pnpm build
node packages/cli/bin/skillctl.js skill validate skills/skillctl
skillctl install   # refresh canonical copy if lock already tracks file:./skills/skillctl
```

Commit changes to `skills/skillctl/`, `agent-skills.json`, and `agent-skills.lock` when the skill content or integrity hash changes.

## Project structure

```
skills/skillctl/    First-party meta-skill (SKILL.md + references)
packages/
├── cli/            Public npm package (@skillctl/cli)
├── core/           Shared types, config, fs, cache
├── manifest/       agent-skills.json
├── lockfile/       agent-skills.lock (YAML)
├── registry/       GitHub, npm, local, skills.sh sources
├── link-manager/   Symlink / junction / copy
├── adapters/       Agent target directories
├── import/         Migration from npx skills / Python skillctl
├── security/       Audit scanner
├── plugin-system/  Experimental plugins
└── project-state/  Cross-process locks and transactional manifest/lock writes
```

All eleven workspace packages are versioned together and publishable. The CLI depends on the other scoped packages.

## Making changes

1. **Fork** the repository and create a branch from `main`.
2. **Keep changes focused** — one feature or fix per PR.
3. **Match existing style** — TypeScript ESM, strict mode, minimal comments.
4. **Run checks** before opening a PR:

   ```bash
   pnpm build
   pnpm test
   pnpm test:coverage
   pnpm -r lint
   ```

5. **Update docs** if you add commands, flags, or change behavior (README + CHANGELOG).

## What to contribute

High-value areas:

- **Adapters** for new AI agents (see `packages/adapters/src/`)
- **Registry sources** (new install backends)
- **Audit rules** in `@skillctl/security`
- **Import parsers** for other skill managers
- **Tests** — especially registry, adapters, import, security
- **Windows** link edge cases and CI scenarios

## Pull request guidelines

- Use a clear title: `feat(adapters): add Windsurf adapter` or `fix(registry): handle npm scope`.
- Describe **what** changed and **why**.
- Link related issues if any.
- Ensure CI passes (GitHub Actions on ubuntu/macos/windows).
- Do not commit `node_modules/`, `dist/`, or `.env`.
- User-facing docs live in `docs/` (published via GitHub Pages).

## Versioning

We follow [Semantic Versioning](https://semver.org/). All workspace packages are kept at the same version (currently **0.8.0**). Update `CHANGELOG.md` under `[Unreleased]` or the next version section.

## Publishing (maintainers)

Release preparation is local and does not publish by itself:

1. `node scripts/set-version.mjs <version>`
2. Update the dated changelog and root meta-skill lock.
3. `node scripts/release-check.mjs --allow-dirty`
4. `node scripts/pack-all.mjs`

The manual `Release` workflow always checks and packs. Publication is disabled by default and requires `publish=true` plus approval through the protected `npm-production` environment. It publishes in dependency order and only then creates the tag and GitHub Release.

For the first 0.5 publication, configure an environment secret named `NPM_TOKEN` because `@skillctl/project-state` does not exist on npm yet and therefore has no package settings page for Trusted Publishing. Use a granular token limited to the `@skillctl` packages and revoke it after the release. Then configure each package's npm Trusted Publisher for repository `xFurti/skillctl`, workflow `release.yml`, environment `npm-production`; subsequent releases use short-lived OIDC credentials.

## Code of conduct

Be respectful and constructive. We welcome beginners and experienced contributors alike.

## Questions

Open a [GitHub issue](https://github.com/xFurti/skillctl/issues) for bugs, feature requests, or design discussions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
