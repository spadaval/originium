# Standards

## TypeScript

- Keep `strict` mode enabled.
- Keep `moduleDetection` set to `force` so scripts and tests are interpreted
  consistently as modules.
- Prefer explicit exported interfaces at package, app, command, and persistence
  boundaries.
- Keep implementation-only helpers private to their file.
- Avoid introducing a new interface unless it hides meaningful policy or the
  next adapter is part of the same change.
- Keep `bun run check:biome` clean. Non-null assertions, unused locals,
  unused parameters, unused imports, useless constructors, and unnecessary
  string templates are errors.

- Keep changes scoped to the bead or explicit user request.
- Prefer existing package boundaries and public exports.
- Do not add compatibility shims or duplicate paths unless an accepted decision
  requires them.
- Keep direct SurrealDB access in `packages/surreal`.
- Keep agent-facing command behavior in `apps/cli` and test it through the
  bundled executable when practical.

## Refactors

- Prefer coherent owned slices over narrow symptom patches.
- If a clear bug is part of a larger owned problem and the current scope allows
  it, fix the whole owned problem rather than preserving adjacent debt.
- Small refactors update callers in the same change.
- Demolition and large boundary-replacement beads may delete old interfaces
  first and break downstream callers. Name the reconnect or closeout bead.
- Do not add compatibility shims, deprecated wrappers, compatibility symlinks,
  transitional aliases, or package re-exports to old implementations.
- Remove replaced names, paths, and interfaces when the bead owns that deletion.
- Tests should use the new public interface directly, not compatibility helpers
  or private source paths.

## Package Boundaries

- `packages/domain` owns pure Graph Wiki language, identifiers, parsing, and
  policies.
- `packages/surreal` owns SurrealDB connection, schema application, file bucket
  helpers, shared persistence helpers, and narrow persistence contracts used by
  multiple app surfaces such as Agent Activity.
- Domain-specific Graph Wiki queries may live with the CLI or web business
  surface that owns the command, route, or projection. Do not move them into
  `packages/surreal` just to centralize query strings.
- `packages/pdf-ingest` owns PDF metadata, heading extraction, and chunk
  projection.
- `apps/cli` owns agent-facing command composition and bundled CLI behavior.
- `apps/web` owns the TanStack Start web shell plus browser-facing backend seams
  for human interaction, editing, projections, PDF streaming, and embedded agent
  chat.
- Surrealist is the POC DB-management and manual validation surface; do not
  vendor its source code into this repository.
- Schema definitions live in `schema/*.surql`; TypeScript code should not hide
  canonical schema changes in ad hoc strings when checked-in SurrealQL is the
  better source of truth.

## SurrealDB

- Keep canonical Graph Wiki state in SurrealDB graph records and relations.
- Do not persist full extracted Source Document body text into wiki records.
- Keep file binaries in SurrealDB file buckets or file-bucket references, not
  JSON fields.
- Use deterministic IDs where repeated imports or ingestion passes should be
  idempotent.
- Report ID collisions with the operation, input identifier, proposed ID, and
  existing conflicting record.
- Use raw SurrealQL when graph relations, indexes, file buckets, or query shapes
  are clearer than an ORM abstraction.

## CLI

- The CLI is the primary agent interface during the POC.
- Tests for command behavior should prefer `apps/cli/dist/originium` over direct
  imports.
- Command failures should include the operation, relevant input or record ID,
  concrete reason, and next useful action.
- Keep source-mode commands for development convenience, but use the bundled CLI
  as the proof surface when testing agent workflows.

## Docs

- Update docs when behavior, architecture, commands, or operating process
  changes.
- Keep product language aligned with `CONTEXT.md`.
- Keep durable decisions in `docs/adr/`.

## Errors

Technical failures should name the operation, relevant input or identifier,
concrete reason, and next useful action.
