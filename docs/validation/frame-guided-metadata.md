# Frame-Guided Metadata Validation

Validation record for `originium-ldf`.

## Fixture Scope

- Cisco source fixture: `fixtures/source-documents/IA-Mining-DG.pdf`
- Frame catalog: `docs/frames/catalog.md`
- Runtime surface: CLI commands, Surreal schema, retrieval context shaping, web Graph Wiki projections

## Commands Run

```bash
bun run --cwd apps/cli build
bun run --cwd apps/cli check:typecheck
bun run --cwd apps/web check:typecheck
bun test apps/cli/src/index.test.ts apps/web/src/server/graph-wiki.test.ts apps/web/src/health.test.ts packages/surreal/src/schema.test.ts
```

Additional targeted checks:

```bash
bunx biome check --write apps/cli/src/index.ts apps/cli/src/index.test.ts
git diff --check
```

## Expected Result State

- Source Documents can carry sparse provenance fields such as `corpus`,
  `publisher`, `document_class`, `industries`, `product_families`, `version`,
  `publication_date`, `trust_status`, `frame`, and `frame_metadata`.
- Wiki Pages can carry `frame` and sparse `frame_metadata` while retaining
  `page_kind` compatibility for existing records.
- `workflow answer-context` includes Wiki Page frame metadata, Citation locator
  and validation status, Source Text Projection metadata, and fetched Source
  Document scope metadata.
- Retrieval candidates expose Wiki Page frame metadata and fetched Source
  Document metadata without replacing evidence-first Citation behavior.
- Web projections show Source Document metadata, Wiki Page frame metadata, and
  distinguish Citation evidence edges from Wiki Page Reference edges and legacy
  Manual Links.

## Failure Cases Proved

- Sparse frame metadata does not block Source Document or Wiki Page writes.
- Invalid Source Document trust status returns a concrete `source.metadata`
  failure before database access.
- Invalid frame metadata JSON returns concrete `page.update` or `frame.assign`
  failures before database access.
- Citation creation rejects non-`source_document:` targets before database
  access.
- New Manual Link writes are rejected with a concrete operation, input, reason,
  and action that points agents to inline Wiki Page References.
- Wiki Page Reference lint catches malformed, duplicate, unresolved, and
  Citation-footnote reference misuse separately from Citation validation.

## Remaining Operational Notes

The validation above uses focused unit and server tests rather than a live
SurrealDB fixture mutation. Live scenario validation should import
`IA-Mining-DG.pdf`, assign a `design_guide` Source Document frame, create or
update a sparse `source_backed_concept` Wiki Page, run `graph lint --family
page-reference`, and inspect the workspace UI against the same expected state.
