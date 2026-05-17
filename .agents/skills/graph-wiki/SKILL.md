---
name: graph-wiki
description: "Use when operating Originium from the CLI as an agent-maintained knowledge base: answer questions, find evidence, import Source Documents, synthesize Wiki Pages, maintain Citations and Manual Links, inspect Change Logs, and clean up graph state."
---

# Originium Graph Wiki

Originium is a CLI-operated knowledge base for agents. It stores trusted source
material, agent-written synthesis, citations, explicit links, and edit logs in a
graph database. The goal is to turn raw Source Documents into a maintained Graph
Wiki that gets more useful over time.

Use Originium when a user asks you to:

- answer a question from the maintained knowledge base
- find source-backed context for a topic
- add or ingest a PDF
- create or update a durable knowledge page
- validate or repair citations
- add explicit relationships between records
- inspect what a previous agent session read or changed
- clean up stale, duplicate, or inconsistent graph state

The `originium` CLI is the main interface. Prefer the installed command:

```bash
originium
```

If `originium` is not on `PATH` and you are inside the source repository, use the
repo wrapper:

```bash
bun run cli --
```

The CLI prints JSON. A successful command has `ok: true`, a human `message`, and
usually a `data` object. A failed command has `ok: false` and an `error` object
with `operation`, `input`, `reason`, and `action`. When a command fails, report
those fields directly; they are intended to be useful technical error messages.

## Core Concepts

**Graph Wiki**: the maintained knowledge base. Its canonical state is graph
records in SurrealDB, not markdown files and not an opaque RAG index.

**Source Document**: trusted raw material, such as an imported PDF. Source
Documents provide evidence, but they are not the final compiled knowledge layer.

**Source Heading**: a heading or chapter-like anchor extracted from a Source
Document. Current Originium citations point to Source Headings.

**Source Anchor**: an agent-maintained citation anchor below or beside a Source
Heading. Use Source Anchors to record narrower body-section evidence without
rewriting extracted Source Headings in place. Until Citation relations support
Source Anchor targets, Graph lint reports heading-level citations as broad when
more specific anchors exist.

**Source Text Projection**: a derived, rebuildable, lossy text cache extracted
from a Source Document for search and retrieval. It is useful for candidate
finding, snippets, page ranges, checksums, and extractor provenance, but it is
not canonical evidence and should not be treated as exact source wording.

**Ingestion Chunk**: an agent-readable projection of one Source Heading or
chapter-sized slice. Use it to process large documents without loading the whole
document into context.

**Wiki Page**: durable agent-written synthesis about a topic, entity, question,
or procedure. Wiki Pages are the primary place to answer from.

**Page Body**: the prose field of a Wiki Page. It may contain Citation Markers
such as `[^network-architecture]`, but it should not contain raw record IDs,
file bucket pointers, page ranges, or source metadata.

**Citation Marker**: an inline marker in a Page Body. It is only a handle.

**Citation**: a graph relation from a Wiki Page to a Source Heading. The
Citation `key` must match the Page Body Citation Marker key.

**Manual Link**: an explicit graph relationship between records. Create one only
when the user asks for a relationship and you can state the reason.

**Agent Session**: a bounded unit of agent work. Start one for every meaningful
task.

**Change Log**: a durable record of CLI reads and writes. Use it to explain,
audit, and repair agent work.

**Graph Retrieval**: search over Wiki Pages and Source Headings, with graph
signals and local embeddings when available.

**Page Candidate**: a Wiki Page candidate returned for concept reuse before a
write. Candidate search is distinct from answer retrieval and evidence search:
it asks "should I update an existing page instead of creating another one?"

## Before Any Work

Check which database the CLI will use:

```bash
originium db status
```

If the database is not running or the schema is missing, initialize it:

```bash
originium db start
originium db doctor
originium db apply-schema
```

Start an Agent Session for the user task:

```bash
originium session start --purpose "<specific task>"
```

Keep the returned `agent_session:<id>` and pass it to later reads and writes:

```bash
originium page search "<topic>" --session <session-id>
```

At the end of the task, inspect the session log:

```bash
originium log show --session <session-id>
```

## Workflow: Answer A Question

Start from maintained synthesis, not raw source search.

1. Search for existing Wiki Pages and graph-backed candidates:

   ```bash
   originium page search "<question or topic>" --session <session-id>
   originium retrieval search "<question or topic>" --session <session-id>
   ```

   When available, use the dedicated answer and graph inspection commands named
   by the graph-native retrieval epic before falling back to generic search:

   ```bash
   originium retrieval search "<question or topic>" --session <session-id>
   originium graph neighborhood <record-id> --session <session-id>
   ```

2. Read the strongest Wiki Page candidates:

   ```bash
   originium page read <wiki-page-id> --session <session-id>
   ```

3. Inspect and validate the page evidence:

   ```bash
   originium citation list <wiki-page-id> --session <session-id>
   originium citation validate <wiki-page-id> --session <session-id>
   ```

4. Answer from the Wiki Page synthesis and cited Source Heading evidence. If a
   claim depends on a Source Text Projection snippet, verify it against the
   cited Source Heading, Source Anchor, or original Source Document before
   presenting it as fact.

5. If search only finds Source Headings, say that the topic has source material
   but no maintained Wiki Page yet. Use the Source Headings as context only if
   that satisfies the user, or create/update a Wiki Page before treating the
   knowledge as compiled.

6. If relevant pages disagree, are stale, or appear superseded, report that
   explicitly. Prefer answers like "the Graph Wiki has two cited sections that
   conflict" over silently choosing one. Name the page section and citation
   label that supports each side.

`page search` and `retrieval search` use local embeddings. If Ollama or the
embedding model is missing, follow the CLI `error.action`. The common fix is:

```bash
ollama pull nomic-embed-text
```

## Workflow: Add A Source Document

Import a PDF only when the user asks you to add, ingest, or use that document as
trusted source material.

1. Import the PDF:

   ```bash
   originium source import-pdf <pdf-path> --session <session-id>
   ```

   Save the returned Source Document ID.

2. Extract Source Headings from the same PDF path:

   ```bash
   originium source headings <pdf-path> \
     --source <source-document-id> \
     --session <session-id>
   ```

   Use `data.headings[].id` as the persisted Source Heading ID for citations
   and links. `extractionHeadingId` is only provenance for the text projection.

3. Choose one Source Heading or chapter-sized anchor. Large documents should be
   processed heading by heading.

4. If you need the chunk projection without creating a Wiki Page yet:

   ```bash
   originium source chunk <pdf-path> \
     --source <source-document-id> \
     --heading <source-heading-id> \
     --max-tokens 100000 \
     --session <session-id>
   ```

   The chunk output makes `persistedSourceHeadingId` and `citationTarget`
   prominent. Use that ID for `citation add`; treat `projectionHeadingId` as
   extraction provenance only.

5. If you need targeted source text without creating graph records:

   ```bash
   originium source read <pdf-path> \
     --source <source-document-id> \
     --heading <source-heading-id>

   originium source search <pdf-path> "<query>" \
     --source <source-document-id> \
     --pages 12-18
   ```

   Source text read/search output is a lossy PDF text projection with page
   range, nearest heading/anchor context, extraction provenance, and checksum.
   Source Text Projection records, when present, have the same evidence status:
   they are search caches, not canonical evidence. Use the original Source
   Document or a verified Source Heading/Anchor read for canonical wording,
   tables, figures, emphasis, diagrams, and layout-sensitive claims.

   As the graph-native retrieval epic lands, prefer DB-backed evidence discovery
   commands before local-path-only PDF search:

   ```bash
   originium source list --session <session-id>
   originium source headings --source <source-document-id> --session <session-id>
   originium source evidence search "<query>" --source <source-document-id> --session <session-id>
   ```

   If those commands are not available yet, use `source headings`, `source read`,
   and `source search` with the local PDF path and report the fallback.

6. If a Source Heading is too broad for a body-section citation, create a Source
   Anchor instead of editing extracted heading records:

   ```bash
   originium source anchor create \
     --title "<body section or evidence name>" \
     --source <source-document-id> \
     --heading <source-heading-id> \
     --pages 12-14 \
     --location "<short location hint>" \
     --reason "<why this anchor is needed>" \
     --session <session-id>
   ```

   Read or search anchors with `source anchor read <source-anchor-id>` and
   `source anchor search "<query>"`.

7. If you need Chapter Ingestion context:

   ```bash
   originium ingest chapter \
     --source <source-document-id> \
     --heading <source-heading-id> \
     --session <session-id>
   ```

Do not copy raw PDF body text into Wiki Pages or durable wiki records. Use
Source Documents and Ingestion Chunks as input for concise synthesis.

## Workflow: Index A Source Document

Use this when the user wants an LLM-powered indexing pass over a document or
chapter. The CLI extracts headings and stores records; the agent is responsible
for deciding which concepts, facts, requirements, procedures, tradeoffs, and
cross-references deserve durable Wiki Pages and graph links.

Indexing is not a page-by-page summary. Build a maintained knowledge layer:

- Create Wiki Pages for concepts that are likely query targets, design
  constraints, deployment patterns, system requirements, procedures,
  component roles, known tradeoffs, and operational risks.
- Prefer one focused page per durable concept. Avoid one giant document summary
  page and avoid tiny pages that only restate a single sentence.
- Before creating a page, prove that a suitable existing page is not already
  present. Use page candidates when available, then search aliases, acronyms,
  broader terms, narrower terms, and adjacent concept names.
- Use chapter or major Source Heading pages only as overview/navigation pages;
  link them to the more specific pages when those relationships are useful.
- Synthesize across multiple Source Headings when a concept is distributed
  across the document. Cite each materially different source of evidence.
- Preserve contradictions, stale information, and superseded guidance in cited
  Wiki Page sections. Do not invent a contradiction schema unless the user asks
  for one or the CLI adds one; write the uncertainty into the synthesis and cite
  the evidence on each side.
- Keep Page Bodies concise and explanatory. They should read like maintained
  wiki entries, not raw source excerpts or extraction notes.

Recommended indexing loop:

1. Start an Agent Session and list Source Headings for the Source Document.
2. Choose a bounded chapter, section cluster, or theme to index.
3. Read the relevant chunks with `source chunk`. For broad or noisy headings,
   use `source search` or `source read --pages <start-end>` to locate the real
   evidence before synthesizing.
4. Run concept reuse checks before writing:

   ```bash
   originium page candidates "<candidate concept>" --session <session-id>
   originium page search "<candidate concept>" --session <session-id>
   originium page search "<alias, acronym, or broader term>" --session <session-id>
   ```

   `page candidates` is owned by the graph-native retrieval epic. If the command
   is not available yet, use repeated `page search` and `retrieval search`, then
   report that concept reuse used the fallback.

5. Decide whether to update, broaden, split, or create using the page
   granularity rules below.
6. Create or update pages with citation markers in the body.
7. Add Citation relations whose keys exactly match the body markers.
8. Add Manual Links when the indexing assignment asks for a rich graph and you
   can state the relationship reason concretely. Examples: "depends on",
   "implements", "constrains", "contrasts with", "is configured by", or
   "provides evidence for". When supported by the CLI, prefer controlled labels
   such as `depends on`, `constrains`, `implements`, `uses`, `applies to`,
   `contrasts with`, `supersedes`, and `related evidence`. Do not add decorative
   or vague links.
9. Validate citations for every page touched.
10. Run Graph lint and address or report hygiene issues with
    `originium graph lint --session <session-id>`.

11. Run retrieval validation for likely questions, aliases, and broader terms
    with `originium retrieval search`, `originium page candidates`, and
    `originium graph neighborhood` when available. Inspect whether intended Wiki
    Pages rank ahead of raw Source Headings and whether graph neighborhoods
    expose useful citations and Manual Links. If planned commands are not
    available yet, use `page search`, `retrieval search`, `citation list`, and
    `link list`, then report the fallback.

12. Inspect the session log and report records read, records changed, validated
    pages, retrieval checks run, Manual Links added, fallbacks used, and known
    gaps.

Quality bar for an indexing pass:

- A later query should find maintained Wiki Pages before raw Source Headings for
  the important topics covered by the indexed scope.
- Each evidence-backed claim in a Page Body should have a nearby Citation
  Marker. One marker can support a short paragraph, but not an entire page of
  unrelated claims.
- Citation labels should name the human source anchor, not repeat opaque record
  IDs.
- Manual Link reasons should explain the domain relationship in plain language.
- Update an existing page when the new material is the same durable concept, an
  alias/acronym, a broader framing of the same page, or a missing cited section
  within the page's scope.
- Broaden an existing page when two narrow pages would always be retrieved
  together and the distinction is mostly naming, vendor phrasing, or source
  document structure.
- Split only when readers would ask different questions, the evidence has
  different operational consequences, the page would mix unrelated lifecycle
  stages, or the synthesis would need separate contradiction/staleness notes.
- Create a new page only after candidate, alias, and broader-term searches do
  not reveal a better home.
- If Source Headings are too broad for confident citation, create Source
  Anchors when the CLI supports the needed anchor; otherwise keep the heading
  citation and report the precision gap.
- If a source point is unclear or contradictory, create a page that preserves
  the uncertainty instead of silently choosing one interpretation.
- If a projection snippet looks useful but cannot be verified against a Source
  Heading, Source Anchor, or original document, do not use it for a durable
  claim. Report the evidence gap.

## Workflow: Create Or Update A Wiki Page

Before writing, search for an existing page about the same topic:

```bash
originium page candidates "<topic>" --session <session-id>
originium page search "<topic>" --session <session-id>
originium page search "<alias, acronym, or broader term>" --session <session-id>
```

Prefer updating the existing Wiki Page over creating a duplicate. Candidate
search is a pre-write requirement for indexing and cleanup work. Read any close
candidate before deciding:

```bash
originium page read <wiki-page-id> --session <session-id>
originium citation list <wiki-page-id> --session <session-id>
originium link list --record <wiki-page-id> --session <session-id>
```

Use this split-vs-merge heuristic:

- Merge or update when the difference is terminology, document structure,
  vendor phrasing, or an alias for the same concept.
- Add a section to an existing page when the new evidence changes nuance,
  version applicability, operational caveats, or known risks within the same
  concept.
- Split when the concept has a different audience, lifecycle stage, failure
  mode, configuration surface, or retrieval intent.
- Keep stale or superseded material in a clearly labeled cited section when it
  is useful for historical interpretation. Otherwise replace stale prose and
  explain the replaced source in the session closeout.

When `page candidates` is unavailable, use repeated `page search` and
`retrieval search` over aliases and broader terms, then report that fallback.

Create a new page:

```bash
originium page create \
  --title "<title>" \
  --body "<concise synthesis with [^citation-key] markers when needed>" \
  --session <session-id>
```

Update a page by title:

```bash
originium page update \
  --title "<title>" \
  --body "<revised synthesis>" \
  --session <session-id>
```

If the Page Body uses Citation Markers, add matching Citation relations:

```bash
originium citation add \
  --page <wiki-page-id> \
  --heading <source-heading-id> \
  --key <citation-key> \
  --label "<human label>" \
  --quote "<short supporting quote when useful>" \
  --session <session-id>
```

Then validate the page:

```bash
originium citation validate <wiki-page-id> --session <session-id>
```

For small corrections, prefer preview-first editing over rewriting the whole
body:

```bash
originium page replace \
  --page <wiki-page-id> \
  --find "<exact current text>" \
  --replace "<replacement text>" \
  --session <session-id>

originium page replace ... --apply
originium page patch --page <wiki-page-id> --body-file <path> --apply
originium page append --page <wiki-page-id> --body "<additional synthesis>" --apply
```

`page replace`, `page patch`, and `page append` preview by default and refuse to
apply edits that make Citation Markers disagree with graph Citations.

Interpret validation results literally:

- `missing-graph-citation`: the Page Body has a marker with no matching
  Citation relation. Add the relation or remove the marker.
- `unused-graph-citation`: a Citation relation exists but no matching marker is
  used in the Page Body. Add the marker or revise the stale citation through a
  supported CLI workflow.
- `duplicate-marker`: the same Citation Marker key appears more than once.
  Rewrite the Page Body.
- `invalid-marker-syntax`: the marker is malformed. Use lowercase keys with
  letters, numbers, `_`, or `-`, such as `[^source-1]`.

## Workflow: Ingest A Chapter Into A Wiki Page

Use this when a Source Heading should become or refresh a Wiki Page in one CLI
operation.

```bash
originium ingest chapter \
  --source <source-document-id> \
  --heading <source-heading-id> \
  --title "<wiki page title>" \
  --body "<concise synthesis with [^citation-key] marker>" \
  --key <citation-key> \
  --label "<human citation label>" \
  --quote "<short supporting quote when useful>" \
  --session <session-id>
```

The Citation Marker in `--body` must match `--key`. If the command reports a
citation validation failure, change the Page Body or key before retrying.

## Workflow: Add Explicit Links

Use Citations for evidence. Use Manual Links for explicit semantic
relationships requested by the user or required by an indexing assignment.
Manual Links should improve future traversal; they are not tags, backlinks, or
decorative related-content links.

```bash
originium link add \
  --from <record-id> \
  --to <record-id> \
  --reason "<why this relationship should exist>" \
  --label "<optional label>" \
  --session <session-id>
```

Inspect links around a record:

```bash
originium link list --record <record-id> --session <session-id>
```

Manual Link discipline:

- Use a concrete label from the controlled vocabulary when the CLI supports it.
  Good labels include `depends on`, `constrains`, `implements`, `uses`,
  `applies to`, `contrasts with`, `supersedes`, and `related evidence`.
- Make the reason specific enough that another agent can explain why traversing
  the edge is useful.
- Prefer Citations for source support and Manual Links for domain
  relationships. Do not use a Manual Link as a substitute for a missing
  Citation.
- Do not infer links just because two pages seem related. If the user or
  indexing assignment did not ask for graph enrichment, leave the relationship
  out.
- For contradiction, stale, or superseded material, usually write a cited page
  section first. Add a `contrasts with` or `supersedes` Manual Link only when it
  connects two durable pages and the traversal reason is clear.

## Workflow: Inspect Or Repair Previous Work

Start with the relevant Agent Session or record ID.

```bash
originium session show <session-id>
originium log show --session <session-id>
originium page read <wiki-page-id> --session <session-id>
originium citation list <wiki-page-id> --session <session-id>
originium citation validate <wiki-page-id> --session <session-id>
originium link list --record <record-id> --session <session-id>
originium graph neighborhood <record-id> --session <session-id>
originium graph lint --session <session-id>
```

Use the Change Log to understand what was read and changed. Prefer compensating
CLI edits over direct database edits so the repair is also logged.

Run `graph lint` before and after cleanup or indexing passes. It reports empty
and uncited Wiki Pages, Citation Marker/Citation mismatches, unused Citations,
duplicate-ish and orphan pages, broad heading-level citation targets when Source
Anchors exist, and Manual Links with missing or vague reasons. Treat the output
as a repair queue; destructive cleanup should be explicit and logged rather than
done through direct database edits.

Typical repairs:

- duplicate topic: update the better Wiki Page; report any unsupported merge or
  delete that still needs a future CLI command
- bad Page Body: run `page update` with corrected synthesis
- citation mismatch: align Citation Markers and Citation keys, then validate
- bad Manual Link: inspect it and report the unsupported removal if no delete
  command exists
- fragmented concept pages: choose the better page, update it with any missing
  cited synthesis, add or report a merge/supersession follow-up, and avoid
  creating another near-duplicate
- stale or superseded synthesis: preserve the older claim in a labeled cited
  section when historically useful; otherwise replace it and report the change
- failed command: report `error.operation`, `error.input`, `error.reason`, and
  `error.action`

## Workflow: Validate A Local Installation

For a local proof that database setup, PDF import, heading extraction, Chapter
Ingestion, citation validation, retrieval, and logging are wired together:

```bash
originium acceptance poc <pdf-path>
```

If the acceptance command fails, use the failing stage, operation, reason, and
action from the JSON output as the next diagnostic step.

## Working Style

- Keep Wiki Pages concise and synthetic. Do not turn them into pasted source
  excerpts.
- Cite claims that depend on Source Document evidence.
- Keep Page Body prose readable. Put evidence targets in Citation relations, not
  inline metadata.
- Process large documents one Source Heading at a time.
- Make every meaningful read and write part of an Agent Session.
- Validate retrieval after indexing with likely questions, aliases, acronyms,
  broader terms, and at least one graph-neighborhood inspection when available.
- End by summarizing records read, records changed, pages reused or created,
  split-vs-merge decisions, citation validation results, retrieval checks,
  Manual Links added, Source Text Projection fallbacks or verification gaps, and
  remaining unsupported cleanup.
