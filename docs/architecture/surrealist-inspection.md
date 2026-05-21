# Surrealist Inspection

Surrealist is the POC database-management surface for inspecting canonical Graph
Wiki state in SurrealDB. It is not an Originium UI, mutation workflow, schema
owner, ingestion orchestrator, or Projection renderer.

Use the CLI and packages for mutations such as schema application, Source
Document import, Wiki Page writes, Citation creation, Agent Session creation,
and Change Log creation. Use Surrealist to inspect the resulting raw tables and
relations during manual validation.

This page documents the legacy POC database shape where `source_heading` records
and heading-targeted `cites` relations may still exist. Those names are retained
here only so operators can inspect old raw records before rebuilding the local
graph; the target model uses Source Documents as Citation targets with
citation-local locator metadata.

## Release Cache

The current local Surrealist desktop cache target is:

- Release: `surrealist-v3.8.5`
- macOS arm64 asset: `Surrealist_3.8.5_aarch64.dmg`
- Cached path: `.originium/tools/surrealist/3.8.5/Surrealist_3.8.5_aarch64.dmg`
- SHA-256:
  `07112ecba22409717ddcce1ba744c9631add7bc07805773543dd5222ffdd3b81`

Do not vendor Surrealist source code into this repository.

## Connection

Default local target:

- URL: `http://127.0.0.1:8000`
- Namespace: `originium`
- Database: `originium`
- User: `root`
- Password: `root`

The target follows the same environment variables used by the CLI:

- `ORIGINIUM_SURREAL_URL`
- `ORIGINIUM_SURREAL_NAMESPACE`
- `ORIGINIUM_SURREAL_DATABASE`
- `ORIGINIUM_SURREAL_USER`
- `ORIGINIUM_SURREAL_PASSWORD`

Use `originium db status` to print the active target before opening Surrealist.
In Surrealist, create an HTTP connection to the URL above, then select the
matching namespace and database.

## Local File Buckets

SurrealDB 3.0 file buckets require experimental file support and a bucket folder
allowlist at server startup. The local CLI configuration starts SurrealDB with:

```bash
SURREAL_CAPS_ALLOW_EXPERIMENTAL=files
SURREAL_BUCKET_FOLDER_ALLOWLIST=.originium/surreal-files
SURREAL_DEFAULT_NAMESPACE=originium
SURREAL_DEFAULT_DATABASE=originium
surreal start --no-banner --log warn --bind 127.0.0.1:8000 --user root --pass root --allow-http --allow-rpc -- surrealkv:.originium/surrealdb
```

The unscoped `--allow-http` and `--allow-rpc` flags are intentional for the
local POC database. Originium's CLI currently uses the HTTP SQL route, while
Surrealist uses the WebSocket/RPC connection flow for sign-in, namespace and
database selection, and query execution.

If the bucket directory is overridden, keep
`SURREAL_BUCKET_FOLDER_ALLOWLIST` aligned with `ORIGINIUM_SURREAL_BUCKET_DIR`.
The current Source Document bucket definition is:

```sql
DEFINE BUCKET IF NOT EXISTS source_documents BACKEND "file:.originium/surreal-files";
```

Bucket setup is a schema/runtime concern. Do not use Surrealist as the source of
truth for creating or changing bucket definitions.

## Tables And Relations

Inspect these schemafull tables for the POC:

- `source_document`: trusted raw document metadata and file bucket reference.
- `source_text_projection`: lossy, rebuildable extracted-text search cache
  with page range and provenance.
- `source_heading`: legacy extracted heading records from Source Documents.
- `wiki_page`: agent-authored synthesis and Page Body.
- `agent_session`: agent run metadata for inspection and undo workflows.
- `change_log`: durable operation log entries.
- `cites`: legacy Citation relation from Wiki Page to Source Heading; target
  citations point to Source Documents with locator metadata.
- `manual_link`: explicit semantic links requested by a user or agent.
- `edited_in`: relation from changed records to Agent Session.

Surrealist shows raw graph/database state. It will not render Originium-specific
agent Projections, citation validation summaries, or final CLI output.

## Query Setup

Paste these queries into Surrealist's query view. Replace example record IDs
with IDs from the inspected fixture state.

```sql
LET $source = source_document:curwb_deployment_for_autonomous_operations_in_open_pit_mining_66dd4ae65769;
LET $heading = source_heading:curwb_deployment_for_autonomous_operations_in_open_pit_mining_66dd4ae65769_chapter_1_autonomous_and_tele_remote_operations_in_open_pit_mining_p1_o1;
LET $projection = source_text_projection:replace_with_projection_id;
LET $chunk = ingestion_chunk:curwb_deployment_for_autonomous_operations_in_open_pit_mining_66dd4ae65769_chapter_1_autonomous_and_tele_remote_operations_in_open_pit_mining_p1_o1_100000;
LET $page = wiki_page:poc_mining_deployment;
LET $session = agent_session:replace_with_acceptance_session;
```

The fixture acceptance command may create those legacy Source Document, Source
Heading, Ingestion Chunk, and Wiki Page IDs. Replace `$projection` when
inspecting a retrieval cache created by indexing work. Replace `$session` with
the Agent Session ID printed by
`originium acceptance poc fixtures/source-documents/IA-Mining-DG.pdf` or by
`originium log show --session <session-id>`.

## Source Documents

List recent Source Documents without loading binary file content:

```sql
SELECT id, title, kind, sha256, mime_type, page_count, source_uri, file, created_at, updated_at
FROM source_document
ORDER BY created_at DESC
LIMIT 20;
```

Inspect one Source Document and its legacy extracted headings:

```sql
SELECT * FROM $source;

SELECT id, title, heading_path, level, start_page, end_page, order, extraction_method
FROM source_heading
WHERE source_document = $source
ORDER BY order ASC;
```

Inspect the Chapter Ingestion chunk created for the first POC chapter:

```sql
SELECT * FROM $chunk;
```

Inspect Source Text Projections without treating them as canonical evidence:

```sql
SELECT id, source_document, source_heading, page_start, page_end, extraction_method, extraction_version, lossy, checksum_sha256, updated_at
FROM source_text_projection
WHERE source_document = $source
ORDER BY page_start ASC, page_end ASC
LIMIT 50;

SELECT id, source_document, source_heading, page_start, page_end, text, extraction_method, lossy
FROM $projection;
```

## Legacy Source Headings

Inspect legacy heading quality and extraction metadata:

```sql
SELECT id, source_document, title, heading_path, level, start_page, end_page, order, destination, extraction_method
FROM source_heading
WHERE source_document = $source
ORDER BY start_page ASC, order ASC;
```

Find headings by title text:

```sql
SELECT id, source_document, title, heading_path, start_page, end_page, extraction_method
FROM source_heading
WHERE title CONTAINS "CURWB"
ORDER BY source_document ASC, order ASC;
```

## Wiki Pages

List Wiki Pages:

```sql
SELECT id, title, slug, created_at, updated_at
FROM wiki_page
ORDER BY updated_at DESC
LIMIT 20;
```

Inspect a Page Body and its outgoing Citation targets:

```sql
SELECT * FROM $page;

SELECT id, key, label, quote, out AS source_heading, created_at
FROM cites
WHERE in = $page
ORDER BY key ASC;

SELECT id, key, label, quote, out AS source_heading
FROM cites
WHERE in = $page
FETCH out;
```

## Citations

Inspect the graph shape around Citation relations:

```sql
SELECT id, in AS wiki_page, key, label, quote, out AS source_heading, created_at
FROM cites
ORDER BY created_at DESC
LIMIT 50;
```

Find all Wiki Pages citing one legacy Source Heading:

```sql
SELECT id, key, label, quote, in AS wiki_page
FROM cites
WHERE out = $heading
FETCH in;
```

Compare Citation keys with Citation Markers in the Page Body through the CLI.
Surrealist can inspect `body` and `cites.key`, but it does not own Originium's
marker/relation validation rules.

## Graph Neighborhoods

Inspect the immediate neighborhood around a Wiki Page:

```sql
SELECT
  *,
  ->cites->source_heading AS cited_source_headings,
  ->manual_link->wiki_page AS linked_wiki_pages,
  ->manual_link->source_heading AS linked_source_headings
FROM $page;
```

Inspect Graph Retrieval candidate surfaces. Surrealist can show the raw
candidate tables; the CLI/package retrieval workflow owns hybrid scoring and
graph-aware reranking.

```sql
SELECT id, title, slug, body, updated_at, ->cites->source_heading AS cited_evidence
FROM wiki_page
ORDER BY updated_at DESC
LIMIT 20;

SELECT id, source_document, source_heading, page_start, page_end, text, extraction_method
FROM source_text_projection
WHERE text CONTAINS "CURWB"
LIMIT 20;
```

Inspect inbound evidence and manual links around a legacy Source Heading:

```sql
SELECT
  *,
  <-cites<-wiki_page AS citing_wiki_pages,
  ->manual_link->source_heading AS outgoing_heading_links,
  <-manual_link<-source_heading AS incoming_heading_links,
  <-manual_link<-wiki_page AS incoming_page_links
FROM $heading;
```

Inspect raw manual links with edge metadata:

```sql
SELECT id, in, out, reason, label, created_session, created_at
FROM manual_link
ORDER BY created_at DESC
LIMIT 50;
```

## Agent Sessions

List recent Agent Sessions:

```sql
SELECT id, purpose, workspace_key, codex_thread_id, codex_model, codex_model_provider, codex_cwd, created_at, updated_at
FROM agent_session
ORDER BY created_at DESC
LIMIT 20;
```

Inspect one session's Change Logs:

```sql
SELECT * FROM $session;

SELECT id, agent_session, operation, target, summary, created_at
FROM change_log
WHERE agent_session = $session
ORDER BY created_at ASC;
```

Inspect `edited_in` relations:

```sql
SELECT id, in AS changed_record, out AS agent_session, created_at
FROM edited_in
WHERE out = $session
ORDER BY created_at ASC;
```

## Change Logs

List recent Change Logs:

```sql
SELECT id, agent_session, operation, target, summary, created_at
FROM change_log
ORDER BY created_at DESC
LIMIT 50;
```

Inspect logs for a target record ID stored in `change_log.target`:

```sql
SELECT id, agent_session, operation, target, summary, created_at
FROM change_log
WHERE target = "wiki_page:curwb_deployment"
ORDER BY created_at ASC;
```

Use these records for manual inspection and undo planning. Apply any actual
undo or correction through Originium-owned CLI/package workflows.
