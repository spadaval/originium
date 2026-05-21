# Quality Baseline

## Always Applies

- Show concrete technical errors with the operation, relevant input or identifier, and actionable reason.
- Prefer the smallest coherent owned slice over a narrow symptom patch.
- Use the owning package, app, workflow, or service interface; do not reach through private source paths.
- Do not add compatibility shims, deprecated wrappers, compatibility symlinks, transitional aliases, dual paths, or old-path re-exports during refactors.
- Keep the Graph Wiki canonical in SurrealDB; markdown-like text is only a Projection.
- Do not copy extracted Source Document body text into Wiki Pages or canonical
  evidence records.
- Durable Source Text Projections are allowed only as lossy, rebuildable search
  caches with provenance; citations point to Source Documents with
  citation-local locator metadata.
- Add or update meaningful tests for behavior changes, bug fixes, contract changes, and non-trivial refactors.
- Skip tests only for pure deletion, mechanical rename, docs-only, tracker-only, or when a missing harness would add more noise than signal.
- Use the validation command catalog to choose the narrowest command set that proves the owned slice.
- Validation proves intended behavior. A test run satisfies validation only when it exercises the intended behavior at the right level and records evidence.
- Keep durable architecture direction in docs and ADRs, not only in bead notes.

## Quality Ownership

| Concern                                                           | Owner             |
| ----------------------------------------------------------------- | ----------------- |
| Formatting, linting, import organization, supported import checks | Biome             |
| Markdown formatting                                               | Prettier          |
| Type soundness                                                    | TypeScript        |
| Repeatable behavior proof                                         | Tests             |
| Scenario-centered product and operator proof                      | Validation        |
| Architecture direction                                            | Docs and ADRs     |
| Tracker graph readiness                                           | Beads lint        |
| Bundled CLI behavior                                              | CLI binary tests  |
| SurrealDB graph contracts                                         | Schema smoke flow |

## Current Validation Catalog

| Concern                      | Command                   |
| ---------------------------- | ------------------------- |
| TypeScript                   | `bun run check:typecheck` |
| Biome formatting and linting | `bun run check:biome`     |
| Markdown formatting          | `bun run check:markdown`  |
| Package builds               | `bun run check:build`     |
| Unit tests                   | `bun test`                |
| Full scaffold gate           | `bun run check`           |

## Error Policy

When a technical operation fails, include:

- the operation name,
- the input or record identifier,
- the concrete reason,
- and the next useful action.

## Read More When

- Code standards, package rules, refactors, schema, CLI, or adapters: [standards.md](standards.md)
- Scenario-centered product or operator validation: [validation.md](validation.md)
- Test strategy, fixtures, and harnesses: [testing.md](testing.md)
- Secrets, source documents, command output, or external-system failure policy: [security.md](security.md)
- Recovery, local database lifecycle, retries, or storage recovery: [reliability.md](reliability.md)
- Architecture audits, refactor opportunity work, or complexity vocabulary: [architecture-quality.md](architecture-quality.md)
