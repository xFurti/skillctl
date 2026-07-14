# Specifiers

Manifest and lock specifiers start with one of these forms:

| Prefix | Example | Notes |
|--------|---------|-------|
| `github:` | `github:owner/repo@main#skills/foo` | Optional ref after `@`, subpath after `#` |
| `skills.sh/` | `skills.sh/owner/repo/skill` | Catalog-selected skill resolved through an immutable GitHub commit |
| `npm:` | `npm:@scope/pkg@^1.0` | Extracts a skill from an npm package |
| `file:` | `file:./.skillctl/skills/my-skill` | Portable project-vendored content |

**Normalization on project `add` and `import`:**

- Local content is copied to `.skillctl/skills/<name>`.
- Manifest `specifier`, lock `specifier`, and local lock `resolved` become `file:./.skillctl/skills/<name>`.
- Lock `canonicalPath` becomes `.skillctl/skills/<name>`.
- A global `add -g` keeps state under `~/.skillctl/` and uses `canonicalPath: ~/.skillctl/skills/<name>`.
- GitHub shorthand `owner/repo#skills/foo` remains supported.
- Legacy lock reads accept `github:owner/repo@sha/skills/foo`; new writes use `#`.
- Branch, tag, and HEAD requests resolve to a full 40-character commit before download.
- npm ranges and dist-tags resolve to an exact version and SRI integrity.
- A selected skills.sh lock resolves as `skills.sh/owner/repo@<sha>#skill=<selector>`; frozen install repeats selection from the pinned commit without a catalog request.

**Legacy, not for new project writes:** `local:imported/<name>`, absolute `file:/...` paths, and global canonical paths in a project lock. Re-add or re-import those skills and commit the vendored store plus updated manifest/lock.
