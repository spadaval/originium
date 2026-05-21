# Graph Wiki Specification

## Purpose

Originium is a Graph Wiki: a persistent, agent-maintained knowledge base that turns a small set of trusted source documents into structured wiki pages backed by a graph database.

The system is not a generic RAG index. Raw sources remain available as
canonical evidence, but the durable product is the maintained wiki: pages,
citations, links, retrieval caches, logs, and projections that compound over
time as agents absorb more material.

The first proof of concept should prove that a large PDF can be imported,
processed page range by page range, converted into useful Wiki Pages, cited back
to Source Documents with precise locator metadata, and queried by agents through
a CLI.

## Design Principles

- The graph database is canonical. Markdown-like text is a projection for humans and LLMs, not the source of truth.
- Source Documents are trusted evidence. Wiki Pages are agent-authored synthesis.
- Source Text Projections are lossy, rebuildable search caches. They improve
  retrieval but never replace the Source Document as evidence.
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

The PDF binary itself should live in a Surreal file bucket rather than in a
normal JSON field. Source Documents are immutable canonical evidence once
imported; if the upstream source changes, import a new Source Document with a
new hash instead of mutating the old evidence record.

Extracted PDF body text must not be copied into Wiki Pages or treated as
canonical evidence. The system may persist Source Text Projections as lossy,
rebuildable search caches that store extracted text, page range, outline or
section context, extraction provenance, and retrieval metadata. Projections may lose
formatting, diagrams, emphasis, tables, cross-page layout, image content, and
reading order. Ingestion and answer workflows may use those projections for
candidate search and agent reading, but citation evidence must still point back
to Source Documents through citation-local locator metadata.

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

The current deployment topology is host-direct. SurrealDB runs as a local
process on the developer host; the CLI runs from that host shell and connects to
that database unless `ORIGINIUM_SURREAL_URL` points elsewhere. This topology is
configured by `ORIGINIUM_SURREAL_BIN`, `ORIGINIUM_SURREAL_BIND`,
`ORIGINIUM_SURREAL_DATA_DIR`, `ORIGINIUM_SURREAL_BUCKET_DIR`,
`ORIGINIUM_SURREAL_PID_FILE`, `ORIGINIUM_SURREAL_URL`,
`ORIGINIUM_SURREAL_NAMESPACE`, `ORIGINIUM_SURREAL_DATABASE`,
`ORIGINIUM_SURREAL_USER`, `ORIGINIUM_SURREAL_PASSWORD`, `ORIGINIUM_SESSION`,
`ORIGINIUM_OLLAMA_URL`, and `ORIGINIUM_OLLAMA_EMBED_MODEL`.

Splitting SurrealDB from the host-direct deployment requires a remote operating
contract first: non-default credentials, provisioned namespace/database, schema
application rules, non-local file-bucket storage, and backend PDF streaming that
does not expose bucket paths.

## Schema Management

Use schemafull SurrealDB tables for core records and relations:

- `source_document`
- `source_text_projection`
- `wiki_page`
- `agent_session`
- `change_log`
- `agent_activity`
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

Source Documents are the immutable canonical evidence boundary. Re-importing a
changed file creates a new Source Document identity because the evidence hash
changed. Derived outline metadata, projections, embeddings, Wiki Pages, and citations
may be rebuilt or revised around that stable evidence record, but they do not
overwrite the Source Document's evidentiary content.

### Source Text Projection

A lossy, rebuildable cache of extracted source text used for retrieval, agent
reading, and evidence discovery.

Initial fields:

- `source_document`
- `page_number` or `page_start`/`page_end`
- `outline_path` or section label when extraction found one
- `page_start`
- `page_end`
- `text`
- `extraction_method`
- `extraction_version`
- `lossy`: `true`
- `checksum_sha256`
- `embedding`
- `created_at`
- `updated_at`

Rules:

- A Source Text Projection is not canonical evidence.
- A Source Text Projection must be rebuildable from the Source Document and the
  current extraction policy.
- Projection text may be indexed for full-text search and vector search.
- Projection text may be shown to agents with provenance and warning text.
- Projection text must not be copied wholesale into Wiki Pages, logs, beads, or
  Change Logs.
- Citation targets should remain Source Documents, not projection rows.

Granularity should use a middle path. For paginated Source Documents, persist
one rebuildable projection per page as the default shape. Page-range reads,
chapter reads, and token-budgeted Ingestion Chunks should be derived from those
page projections or directly from the Source Document rather than persisted as
canonical document sections. Avoid single-token, sentence, or arbitrary tiny
chunks as the primary persisted shape, and avoid whole-document projections that
are too coarse to cite, inspect, or rerank usefully.

### Ingestion Chunk

A token-budgeted slice used during Chapter Ingestion.

Chunking rule:

- Prefer document-local page ranges and outline metadata for human orientation.
- Split only when a selected page range exceeds the configured token budget.
- Keep chunk size configurable.
- Start with a practical default around 100k estimated tokens.
- Treat chunk text as an agent-readable projection from the stored Source Document, not as canonical wiki state.
- Persist chunk metadata only when useful: source document, page range, token
  estimate, projection identifiers, outline metadata, and extraction method.

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

Imported Source Documents and Wiki Pages should use deterministic record IDs
where practical.

Recommended ID inputs:

- Source Document: normalized title or filename plus a short hash of the whole file, for example `source_document:ia_mining_dg_2f8a91c4`.
- Source Text Projection: source document ID plus page number or page range and
  extraction version when persisted.
- Wiki Page: normalized slug from title, with explicit conflict handling.
- Agent Session and Change Log: generated IDs.

Deterministic IDs make repeated imports and idempotent ingestion easier. If an ID collision occurs, the CLI should report the conflicting operation, input identifier, and existing record.

## Graph Relations

Use Surreal graph relations for relationships that need metadata.

### `cites`

Connects a Wiki Page to a Source Document.

Shape:

```sql
RELATE wiki_page:fm_1000->cites->source_document:fm_shield_manual
SET
  key = "fm1000-enclosure",
  label = "ruggedized enclosure",
  page_start = 12,
  page_end = 12,
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
- Wiki Page to Source Document
- Wiki Page to source locator metadata through Citation relations, not Manual
  Links

Rules:

- Do not create links automatically in the POC.
- Store reason, created session, and optional label on the edge.

### `edited_in`

Connects edited records to the Agent Session that changed them.

This is secondary to the Change Log, but useful for traversal.

## Retrieval

The POC retrieval model should use SurrealDB for hybrid candidate search and
Originium graph semantics for reranking. SurrealDB over-fetches candidates with
full-text and vector search across Wiki Pages, Source Documents, and Source
Text Projections. Originium then reranks those candidates with graph authority:
Citation relations, Manual Links, nearby Wiki Pages, locator quality, and
evidence proximity.

Initial candidate records:

- Wiki Pages, searched by `title` and `body`
- Source Documents, searched by `title`, corpus/source metadata, and imported
  outline metadata
- Source Text Projections, searched by extracted `text`, page range,
  extraction provenance, and embeddings

Initial ranking signals:

- Full-text score
- Vector similarity when embeddings are available
- Citation authority, such as inbound `cites` edges from Wiki Pages
- Manual-link authority, such as inbound `manual_link` edges from other relevant records
- Evidence proximity, such as a projection page range overlapping a locator
  cited by an already relevant Wiki Page
- Extraction confidence, such as PDF outline-derived context ranking above
  low-confidence synthetic section context

Initial embedding engine:

- Use Ollama for local embeddings.
- Default local model: `nomic-embed-text` unless a better local embedding model is configured.
- Keep embedding generation behind a provider interface so the system can swap embedding engines later without changing graph schema.
- Embed Wiki Pages and Source Text Projections first. Source Documents can rely
  on title/source metadata initially unless document-level embeddings prove
  useful.

Search jobs should stay distinct:

- Concept reuse checks find existing Wiki Pages before creating or splitting
  synthesis. They should prefer Wiki Page title/body matches and nearby Manual
  Links over raw source text.
- Answer retrieval finds the best synthesized answer context. It should search
  Wiki Pages first, then use graph reranking and Citation relations to pull
  supporting Source Documents and Source Text Projections.
- Evidence search finds source-backed support or disagreement. It should search
  Source Documents and Source Text Projections, show extraction provenance and
  page ranges, and keep Source Documents as the final evidence boundary.
- Graph neighborhood inspection starts from known records and traverses
  Citations, Manual Links, edited-in sessions, and nearby Wiki Pages or cited
  Source Documents. It is not a text search substitute.

Preferred answer flow:

1. Search Wiki Pages first.
2. Follow Citation relations to Source Documents and citation-local locators for
   evidence.
3. Search or read Source Text Projections when the answer needs source
   verification, disagreement checks, or additional context.
4. Fall back to Source Document/projection search when the wiki has not yet
   synthesized the topic.
5. Rebuild or refresh projections from the Source Document when projection
   provenance is stale or too lossy for the answer.

Do not build the POC around raw PDF text search as the primary answer path. The point of the system is for Wiki Pages to compound into the useful knowledge layer.

Contradiction handling should remain evidence-first without hardcoding a
contradiction schema for the POC. When sources or Wiki Pages disagree, the
answer workflow should surface the competing cited claims, their Source
Documents, citation-local locators, and relevant Source Text Projections. Wiki
Pages should state the disagreement in prose with Citation Markers and preserve
graph evidence through Citation relations. Add a dedicated contradiction record
or relation only after repeated workflows show the fields, lifecycle, and review
semantics needed.

## Change Log

Mutating CLI commands should append Change Log entries. Read commands should not
create durable Change Log history.

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

## Agent Activity

Agent Activity records are persisted runtime events for an Agent Session. They
are separate from Change Log entries because Change Logs describe Graph Wiki
mutations, while Agent Activity records describe what the embedded agent is
doing around those mutations.

Initial Agent Activity fields:

- `agent_session`
- `source`: `codex_app_server | cli | web`
- `kind`: `message | command | tool | file_change | graph_mutation | status | error`
- `status`: `started | streaming | completed | failed`
- `summary`
- `operation`
- `target_records`
- `metadata`
- `created_at`

The Agent Activity Log in the web app should render Agent Activity records and
Change Log entries together as one session timeline. The database should keep
the records distinct so mutation history remains useful for inspection and
undo.

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
originium source projections rebuild --source <source-id>
originium source read --source <source-id> --pages <start-end>

originium page create --title <title>
originium page read <page-id-or-slug>
originium page update <page-id-or-slug> --body-file <path>
originium page search <query>

originium citation add --page <page> --key <key> --source <source-document> --pages <start-end>
originium citation list --page <page>
originium citation validate --page <page>

originium link add --from <record-id> --to <record-id> --label <label>
originium link list <record-id>

originium ingest chapter --source <source-id> --pages <start-end>
```

The CLI should print useful technical errors. A failed import should name the
file path, operation, and reason. A failed citation add should name the page,
marker key, target Source Document, locator fields, and concrete validation
failure.

## Package Boundaries

Initial TypeScript package/app shape:

- `packages/domain`: Graph Wiki domain types, validation, ID helpers, citation-marker parsing, and pure policies.
- `packages/surreal`: SurrealDB connection, schema application, table/relation access, file bucket helpers, retrieval queries, and logging wrappers.
- `packages/pdf-ingest`: PDF metadata, outline metadata extraction, page-range extraction, per-page Source Text Projection generation, and token-budgeted chunk projection.
- `apps/cli`: agent-facing CLI commands composed from domain, SurrealDB, and PDF ingestion packages.
- `apps/web`: TanStack Start web shell and host-direct backend seams for Source Document, Wiki Page, Agent Session, Change Log, Agent Activity, and PDF streaming workflows.
- `.agents/skills/graph-wiki`: repo-local agent instructions for using the CLI, preserving citation markers, and respecting the Graph Wiki model.

The Originium web app owns browser-facing interaction and backend seams. It
should not own ingestion or database mutation semantics. The CLI, web backend,
and future workers should use the same package seams.

## Chapter Ingestion Workflow

The POC ingestion loop:

1. Import PDF into a Surreal file bucket.
2. Extract PDF metadata, outline metadata, and per-page Source Text Projections.
3. Pick one page range, chapter, or theme.
4. Create token-budgeted Ingestion Chunks for that range when needed.
5. Let an agent read the chunk or Source Text Projection and existing related Wiki Pages.
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
5. Extract outline metadata and rebuild per-page Source Text Projections.
6. Select one chapter or page range.
7. Create or read a Source Text Projection or Ingestion Chunk projection for
   that range.
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
- Source Document outline/projection coverage
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

## Web App Direction

The Originium web app should be an Agent Workspace rather than a traditional
document-management UI. The core interaction is chat with an unrestricted agent
that can mutate Graph Wiki state through the same CLI/package/database semantics
used by the POC. The app should not introduce approval workflows for agent
actions in the first version.

The main workspace should show:

- agent chat as the primary interaction surface
- a persisted Agent Activity Log derived from the existing Agent Session and
  Change Log model, with non-mutating runtime events stored as Agent Activity
  records rather than a parallel web-only audit path
- a graph view for Graph Wiki records and relations
- a Wiki Page viewer with basic Page Body editing and citation validation, but
  no direct graph editing

Initial routes:

- `/workspace`: two-pane Agent Workspace with chat and activity on the left,
  and graph/page tabs on the right.
- `/sources`: Source Document Page with Source Document list, import/extraction
  status, outline/projection coverage, and embedded PDF viewer for PDF Source
  Documents.

The web app should also include a dedicated Source Document Page. That page
should list imported Source Documents, show import/extraction status and
outline/projection metadata, and embed a PDF viewer for PDF Source Documents when
the stored file can be served safely from the backend. The browser should load
PDFs through an Originium backend endpoint, not by talking directly to SurrealDB
file buckets or local bucket paths. The first viewer should use browser-native
PDF embedding against that backend URL; custom PDF.js-style controls should wait
until native embedding blocks real source-reading or citation workflows.

The first web app agent runtime should couple directly to Codex app-server. Do
not add an agent-runtime abstraction before there is a concrete second runtime.
The backend should own the Codex app-server process/protocol boundary, database
access, Source Document file access, and CLI/RPC calls. The browser should talk
to the Originium backend rather than directly to SurrealDB, local files, or the
agent process. `apps/web` should become a TanStack Start app, with server
functions owning SurrealDB access, backend PDF streaming, and Codex app-server
process control.

For the single-host foundation, the web backend, Codex app-server, SurrealDB,
and CLI execution remain co-located on the same trusted host. The web frontend
is served by `apps/web` and has no direct runtime contract with SurrealDB, local
files, the CLI, or Codex app-server. The host-direct web backend contract is
owned by `apps/web`: it reads SurrealDB variables through `packages/surreal`,
listens on `ORIGINIUM_WEB_BACKEND_BIND`, reaches Codex app-server through
`ORIGINIUM_CODEX_APP_SERVER_BIND` and `ORIGINIUM_CODEX_APP_SERVER_URL`, shells
to the CLI at `ORIGINIUM_CLI_PATH`, and serves PDF Source Documents through
`ORIGINIUM_WEB_SOURCE_PDFS_ENABLED`,
`ORIGINIUM_WEB_SOURCE_PDF_ROUTE_PREFIX`, and
`ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR`. The PDF bucket path defaults to the
SurrealDB bucket directory so host-direct storage remains one local operating
contract unless explicitly overridden.

Splitting the frontend from the backend requires a complete backend API for
Graph Wiki projections, PDF streaming, citation validation, chat/activity
streaming, authentication, and origin policy. Splitting agent workers from the
backend requires durable job/session state, workspace ownership, Agent Activity
stream persistence, cancellation/retry semantics, and credential handling.

One Codex app-server thread should map to one Originium Agent Session. Store the
Codex thread identifier on the Agent Session or related runtime metadata so the
web app can resume the chat/activity timeline and correlate Codex events with
Graph Wiki mutations.

The first graph view should render the local graph neighborhood of the selected
record rather than the full Graph Wiki. For a selected Wiki Page, that
neighborhood includes the page, cited Source Documents with locator metadata,
Manual Links, and nearby Wiki Pages. Full-graph exploration can wait until
there is evidence the local view is not enough.

Basic Wiki Page editing belongs in the Page viewer. It should update only the
Page Body, preserve graph-owned Citations and Manual Links, and run citation
validation after save.

## Technology Direction

Preferred stack:

- TypeScript
- Effect for typed runtime boundaries and errors
- Surrealist desktop release for POC database inspection
- TanStack Start for the later Originium app
- SurrealDB for graph, document, and file storage
- Ollama for initial local embedding generation
- Codex app-server for the first embedded web agent runtime
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
- Human approval gates for agent actions
- Pi or Codex plugin packaging for reusable agent operating system

## External References

- Karpathy LLM wiki note: https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw/ac46de1ad27f92b28ac95459c782c07f6b8c964a/llm-wiki.md
- SurrealDB file buckets: https://surrealdb.com/docs/learn/schema-management/files/buckets
- SurrealDB files: https://surrealdb.com/docs/learn/schema-management/files/working-with-files
- SurrealDB graph relations: https://surrealdb.com/docs/reference/query-language/statements/relate
- LibPDF text extraction: https://libpdf.documenso.com/docs/guides/text-extraction
