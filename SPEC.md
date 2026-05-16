# Graph Wiki Specification

## Purpose

Originium is a Graph Wiki: a persistent, agent-maintained knowledge base that turns a small set of trusted source documents into structured wiki pages backed by a graph database.

The system is not a generic RAG index. Raw sources remain available, but the durable product is the maintained wiki: pages, citations, links, source headings, logs, and projections that compound over time as agents absorb more material.

The first proof of concept should prove that a large PDF can be imported, processed chapter by chapter, converted into useful Wiki Pages, cited back to stable source headings, and queried by agents through a CLI.

## Design Principles

- The graph database is canonical. Markdown-like text is a projection for humans and LLMs, not the source of truth.
- Source Documents are trusted evidence. Wiki Pages are agent-authored synthesis.
- Citations use graph relations. Page prose may contain citation markers, but source targets do not live as raw inline addresses.
- Links are explicit. Agents create semantic links only when asked to do so.
- The system should prefer simple records first, then split them only when real workflows demand more structure.
- Agent writes are allowed for the POC. Safety comes from access/edit logging and the ability to ask an agent to inspect and undo another agent's work.
- Technical failures should be concrete: include operation, input identifier, and actionable reason.

## POC Fixture

The initial stress fixture is:

- `fixtures/source-documents/IA-Mining-DG.pdf`
- PDF title: `CURWB Deployment for Autonomous Operations in Open-Pit Mining`
- Size: about 27 MB
- Pages: 174

The POC should process documents of roughly 200 pages without requiring the whole document to be loaded into agent context at once.

## Storage

Use SurrealDB as the canonical database. Use Surreal file buckets for Source Document binary storage when the server is configured for file buckets.

Source Document records should store:

- file pointer
- SHA-256 hash
- MIME type
- title
- source path or source URL
- page count when available
- extraction status
- import timestamp

The PDF binary itself should live in a Surreal file bucket rather than in a normal JSON field. Extracted PDF body text should not be copied into Wiki Pages or durable source-text records for the POC. Ingestion should read source text from the stored file when needed, then write synthesis, citations, links, headings, and logs.

The CLI should manage local development SurrealDB processes instead of assuming an ambient server is correctly configured. It should still support connecting to an external SurrealDB URL.

Local database commands:

```bash
originium db start
originium db stop
originium db status
originium db doctor
originium db apply-schema
```

`db start` should use a pinned/configured SurrealDB binary from `ORIGINIUM_SURREAL_BIN` or `PATH`, a project-owned data directory, required file-bucket allowlist settings, namespace/database configuration, and explicit auth. Later releases may auto-download a pinned SurrealDB binary into a tool cache, but the POC should not vendor server binaries inside the CLI app.

## Schema Management

Use schemafull SurrealDB tables for core records and relations:

- `source_document`
- `source_heading`
- `wiki_page`
- `agent_session`
- `change_log`
- `cites`
- `manual_link`
- `edited_in`

Use flexible metadata objects only where the input is inherently extractor- or provider-specific.

Store schema definitions in checked-in `.surql` files. The CLI should expose a database setup/apply command rather than relying on ad hoc manual setup.

Target commands:

```bash
originium db status
originium db apply-schema
```

TypeScript types should come from a type-safe database layer where practical. Surqlize is the leading candidate, but raw SurrealQL remains acceptable for file bucket operations, vector/full-text search, graph re-ranking, migrations, or any query shape the ORM cannot express cleanly.

## Source Model

### Source Document

A trusted raw document imported into the Graph Wiki.

Initial fields:

- `title`
- `kind`: `pdf | web`
- `file`
- `sha256`
- `mime_type`
- `page_count`
- `source_uri`
- `created_at`
- `updated_at`

### Source Heading

A heading extracted from a Source Document. Source Headings are the default citation anchors.

Initial fields:

- `source_document`
- `title`
- `heading_path`
- `level`
- `start_page`
- `end_page`
- `order`
- `destination`

The system should use the PDF table of contents, outlines, annotations, or extracted heading-like text when available. If a source lacks clean headings, ingestion should create coarse synthetic headings with clear provenance.

Heading extraction should use a layered fallback:

1. PDF outline/bookmarks when available.
2. Table-of-contents parsing when outline data is missing or incomplete.
3. Heading-like text detection from extracted page text as a last resort.

Each extracted Source Heading should record the extraction method so low-confidence headings are visible to agents and users.

### Ingestion Chunk

A token-budgeted slice used during Chapter Ingestion.

Chunking rule:

- Prefer Source Heading boundaries.
- Split only when a heading exceeds the configured token budget.
- Keep chunk size configurable.
- Start with a practical default around 100k estimated tokens.
- Treat chunk text as an agent-readable projection from the stored Source Document, not as canonical wiki state.
- Persist chunk metadata only when useful: source document, source heading, page range, token estimate, and extraction method.

## Wiki Model

### Wiki Page

A durable synthesis page about a topic, entity, concept, question, or procedure.

Initial fields:

- `title`
- `slug`
- `body`
- `created_at`
- `updated_at`

`body` is markdown-ish prose for humans and LLMs. It should not contain canonical source addresses, metadata, link objects, or citation targets.

Citation markers in `body` should look like ordinary footnote-style markers:

```md
The FM 1000 features a ruggedized enclosure [^fm1000-enclosure].
```

The marker is only a handle. The canonical citation target is a graph relation.

## Record Identity

Imported Source Documents and Source Headings should use deterministic record IDs where practical.

Recommended ID inputs:

- Source Document: normalized title or filename plus a short hash of the whole file, for example `source_document:ia_mining_dg_2f8a91c4`.
- Source Heading: source document ID plus normalized heading path, page range, and order, for example `source_heading:ia_mining_dg_2f8a91c4_chapter_2_curwb_architecture`.
- Wiki Page: normalized slug from title, with explicit conflict handling.
- Agent Session and Change Log: generated IDs.

Deterministic IDs make repeated imports and idempotent ingestion easier. If an ID collision occurs, the CLI should report the conflicting operation, input identifier, and existing record.

## Graph Relations

Use Surreal graph relations for relationships that need metadata.

### `cites`

Connects a Wiki Page to a Source Heading.

Shape:

```sql
RELATE wiki_page:fm_1000->cites->source_heading:fm_shield_ruggedized_enclosure
SET
  key = "fm1000-enclosure",
  label = "ruggedized enclosure",
  quote = "FM-Shield Ruggedized Enclosure",
  created_at = time::now();
```

Rules:

- `key` is unique within a Wiki Page.
- `key` must match a citation marker in `body` when the citation is used in prose.
- A citation can exist before the prose uses it, but validation should report unused citations.

### `manual_link`

Connects graph records when an agent is explicitly asked to create a semantic link.

Potential endpoints:

- Wiki Page to Wiki Page
- Wiki Page to Source Heading
- Source Heading to Source Heading

Rules:

- Do not create links automatically in the POC.
- Store reason, created session, and optional label on the edge.

### `edited_in`

Connects edited records to the Agent Session that changed them.

This is secondary to the Change Log, but useful for traversal.

## Retrieval

The POC retrieval model should follow SurrealDB's graph-enhanced RAG pattern: over-fetch candidates with hybrid full-text and vector search, then re-rank using graph authority.

Initial candidate records:

- Wiki Pages, searched by `title` and `body`
- Source Headings, searched by `title`, `heading_path`, and source metadata

Initial ranking signals:

- Full-text score
- Vector similarity when embeddings are available
- Citation authority, such as inbound `cites` edges from Wiki Pages
- Manual-link authority, such as inbound `manual_link` edges from other relevant records

Initial embedding engine:

- Use Ollama for local embeddings.
- Default local model: `nomic-embed-text` unless a better local embedding model is configured.
- Keep embedding generation behind a provider interface so the system can swap embedding engines later without changing graph schema.
- Embed Wiki Pages first. Source Headings can rely on title/path metadata initially because source body text is not durably copied into the wiki database.

Preferred answer flow:

1. Search Wiki Pages first.
2. Follow Citation relations to Source Headings for evidence.
3. Extract source text from the PDF file only when the answer needs source verification or additional context.
4. Fall back to Source Heading search when the wiki has not yet synthesized the topic.

Do not build the POC around raw PDF text search as the primary answer path. The point of the system is for Wiki Pages to compound into the useful knowledge layer.

## Access And Edit Log

Every CLI command that reads or writes the Graph Wiki should append a Change Log entry.

For reads, log:

- session
- command
- target records or query string
- timestamp

For edits, log:

- session
- command
- target records
- before JSON when available
- after JSON when available
- timestamp

The first undo workflow is agent-assisted:

1. Show all log entries for an Agent Session.
2. Ask an agent to inspect the before/after data.
3. The agent writes compensating edits through the CLI.
4. Those compensating edits are also logged.

Automated rollback is not required for the POC.

## CLI

The CLI is the primary agent interface.

Target command groups:

```bash
originium db start
originium db stop
originium db status
originium db doctor
originium db apply-schema
originium session start
originium session show <session-id>
originium log show --session <session-id>

originium source import-pdf <path>
originium source headings <source-id>
originium source chunk <source-id> --heading <heading-id> --max-tokens 100000

originium page create --title <title>
originium page read <page-id-or-slug>
originium page update <page-id-or-slug> --body-file <path>
originium page search <query>

originium citation add --page <page> --key <key> --heading <heading>
originium citation list --page <page>
originium citation validate --page <page>

originium link add --from <record-id> --to <record-id> --label <label>
originium link list <record-id>

originium ingest chapter --source <source-id> --heading <heading-id>
```

The CLI should print useful technical errors. A failed import should name the file path, operation, and reason. A failed citation add should name the page, marker key, target heading, and concrete validation failure.

## Package Boundaries

Initial TypeScript package/app shape:

- `packages/domain`: Graph Wiki domain types, validation, ID helpers, citation-marker parsing, and pure policies.
- `packages/surreal`: SurrealDB connection, schema application, table/relation access, file bucket helpers, retrieval queries, and logging wrappers.
- `packages/pdf-ingest`: PDF metadata, heading extraction, page-range extraction, and token-budgeted chunk projection.
- `apps/cli`: agent-facing CLI commands composed from domain, SurrealDB, and PDF ingestion packages.
- `apps/web`: deferred human-facing Graph Wiki app for user workflows, editing,
  agent chat, and richer Graph Wiki projections.
- `.agents/skills/graph-wiki`: repo-local agent instructions for using the CLI, preserving citation markers, and respecting the Graph Wiki model.

The Originium app is deferred until after the first POC. It should not own
ingestion or database mutation semantics when introduced. The CLI and future
workers should use the same package seams.

## Chapter Ingestion Workflow

The POC ingestion loop:

1. Import PDF into a Surreal file bucket.
2. Extract PDF metadata and source headings.
3. Pick one Source Heading or chapter.
4. Create token-budgeted Ingestion Chunks for that heading.
5. Let an agent read the chunk and existing related Wiki Pages.
6. The agent creates or updates Wiki Pages.
7. The agent creates Citation relations for the citation markers it used.
8. The agent optionally creates Manual Links when explicitly requested.
9. The CLI logs all reads and edits.
10. Validate that page citation markers and Citation relations agree.

The workflow must support repeated passes over the same Source Document. Later chapters should be able to link to pages created by earlier chapters.

## First Acceptance Test

The first end-to-end proof should run against `fixtures/source-documents/IA-Mining-DG.pdf` and prove the smallest useful loop:

1. Start or connect to a correctly configured SurrealDB instance.
2. Apply schema.
3. Import the PDF into a file bucket.
4. Create a deterministic Source Document record.
5. Extract Source Headings.
6. Select one chapter.
7. Create an Ingestion Chunk projection for that chapter.
8. Create or update one Wiki Page from the chapter.
9. Add at least one Citation relation and matching Citation Marker.
10. Validate citation markers against graph citations.
11. Query the Wiki Page through Graph Retrieval.
12. Show Change Log entries for the session.

This test should fail with concrete operation names and identifiers when any step is unavailable, including missing SurrealDB file support, missing PDF extraction support, missing Ollama model, or citation mismatch.

## Inspection

For the POC, use Surrealist as an external database-management and manual
validation surface rather than building the Originium app. Do not vendor the
Surrealist source code. Manage downloaded desktop release artifacts in the
repo-local ignored tool cache when needed.

POC inspection should prove a human can inspect:

- Source Document list
- Source Heading outline for a Source Document
- Wiki Page reader
- Citation panel for a Wiki Page
- Graph neighborhood for a record
- Agent Session and Change Log viewer

Surrealist will expose these through tables, records, graph relations, and
saved/manual SurrealQL queries rather than Originium-specific screens. Editing
remains CLI-first during the POC. Longer term, Originium should still have its
own app for user-type interaction, editing, richer projections, and embedded
agent chat, while Surrealist remains useful for DB-management tasks and manual
validation.

## Technology Direction

Preferred stack:

- TypeScript
- Effect for typed runtime boundaries and errors
- Surrealist desktop release for POC database inspection
- TanStack Start for the later Originium app
- SurrealDB for graph, document, and file storage
- Ollama for initial local embedding generation
- Surqlize or a similar type-safe SurrealDB query layer if it supports the schema and graph relation needs cleanly
- LibPDF or a similar TypeScript PDF parser for initial PDF extraction

If TypeScript PDF extraction fails on the POC fixture, extraction may move behind a typed adapter. The rest of the product should remain TypeScript.

Surqlize is a promising candidate because its upstream repository describes type-safe schema definitions, full TypeScript inference, fluent queries, CRUD operations, and first-class graph relationship support. Verify it against our exact SurrealDB version, file bucket usage, vector search, full-text search, and custom SurrealQL needs before depending on it for every database operation.

## Deferred Work

- Explicit contradiction modeling
- Human approval gates
- Fine-grained automatic rollback
- Automatic semantic link creation
- OCR for scanned PDFs
- Full structured page/block model
- Claim-level fact graph
- Originium-owned human-facing app with editing, richer projections, and
  embedded agent chat
- Pi or Codex plugin packaging for reusable agent operating system

## External References

- Karpathy LLM wiki note: https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw/ac46de1ad27f92b28ac95459c782c07f6b8c964a/llm-wiki.md
- SurrealDB file buckets: https://surrealdb.com/docs/learn/schema-management/files/buckets
- SurrealDB files: https://surrealdb.com/docs/learn/schema-management/files/working-with-files
- SurrealDB graph relations: https://surrealdb.com/docs/reference/query-language/statements/relate
- LibPDF text extraction: https://libpdf.documenso.com/docs/guides/text-extraction
