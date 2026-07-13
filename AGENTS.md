# Repository Guidelines

## Project Structure & Module Organization

This repository is a pnpm workspace of TypeScript packages under `packages/`. The public CLI lives in `packages/cli`; shared behavior is split among `core`, `manifest`, `lockfile`, `registry`, `link-manager`, `adapters`, `import`, `security`, `plugin-system`, and `project-state`. Production code belongs in each package's `src/`, with tests in `src/test/` and fixtures beside the package that consumes them. The first-party Agent Skill is in `skills/skillctl/`. Browser documentation and static assets live in `docs/`; brand artwork is in `brand/`; release utilities are in `scripts/`. Do not commit generated `dist/`, `node_modules/`, or environment files.

## Build, Test, and Development Commands

- `pnpm install` installs all workspace dependencies (Node.js >= 22.13, pnpm 11.x).
- `pnpm build` builds every package; use `pnpm build:cli` for only the CLI.
- `pnpm dev` watches/runs the CLI package during development.
- `node packages/cli/bin/skillctl.js --help` exercises the locally built executable.
- `pnpm test` runs all package test suites.
- `pnpm test:coverage` enforces repository coverage thresholds.
- `pnpm lint` runs each workspace package's TypeScript checks.

## Coding Style & Naming Conventions

Use strict TypeScript and ESM imports, including `.js` extensions for local imports. Follow existing formatting: two-space indentation, single quotes, semicolons, trailing commas, and minimal comments. Use `camelCase` for variables/functions, `PascalCase` for types, and kebab-case filenames such as `normalize-specifier.ts`. Keep public exports intentional through package `src/index.ts` files. Prefer small modules with package ownership over adding cross-package shortcuts.

## Testing Guidelines

Tests use `node:test` with `node:assert/strict`; name files `*.test.ts` under `src/test/`. Add regression tests in the package whose behavior changes, including failure and platform-sensitive cases. Run `pnpm build && pnpm test` before submitting. Coverage must remain at least 60% for lines, functions, and statements, and 50% for branches.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commits, for example `fix(ci): normalize links` or `docs: align documentation`. Keep commits and PRs focused on one change. PRs should explain what changed and why, link relevant issues, update `README.md`, `docs/`, and `CHANGELOG.md` for user-visible behavior, and pass CI on Ubuntu, macOS, and Windows. Include screenshots for documentation UI changes. When editing `skills/skillctl/`, validate it and commit updated `agent-skills.json` and `agent-skills.lock` when integrity changes.
