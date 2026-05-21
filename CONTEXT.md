# Graph Wiki

A Graph Wiki is a persistent, agent-maintained knowledge base that compiles trusted source documents into structured, linked pages stored in a graph database.

## Language

**Graph Wiki**:
A structured wiki whose canonical state lives in a graph database rather than markdown files.
_Avoid_: knowledge graph, wiki, RAG index

**Source Document**:
A trusted raw document that the Graph Wiki reads from but does not treat as agent-authored synthesis.
_Avoid_: document, file, reference

**Source Text Projection**:
A lossy, rebuildable search cache derived from a Source Document for retrieval,
agent reading, and evidence discovery. For paginated Source Documents, the
stored projection unit is one page. Larger text views are derived by ordering
and combining page projections unless a later performance need justifies a
separate cache. It may preserve page text, extraction provenance, and
embeddings, but it is not canonical evidence and must be regenerated when
extraction policy changes.
_Avoid_: canonical text, source copy, evidence record

**Wiki Page**:
An agent-maintained synthesis record about a topic, entity, question, or other durable subject in the Graph Wiki.
_Avoid_: markdown page, concept cache

**Page Body**:
The prose synthesis of a Wiki Page, separate from citations, metadata, and graph links.
_Avoid_: content object, markdown file

**Citation**:
A relationship from wiki synthesis back to one or more Source Documents that support it, with citation-local locator metadata when needed.
_Avoid_: reference, link

**Citation Marker**:
A stable inline marker in a Page Body that points to a Citation graph relation.
_Avoid_: raw source address, inline reference

**Projection**:
A rendered view of graph data for humans or agents, such as markdown-like text generated from Wiki Pages and their linked records.
_Avoid_: canonical markdown, export

**Change Log**:
An append-only record of Graph Wiki mutations used to inspect and undo agent work.
_Avoid_: event store, revision history

**Agent Session**:
A bounded unit of agent work whose Graph Wiki mutations can be reviewed through the Change Log.
For Agent Workspace work, the Agent Session also stores the workspace key and
Codex thread metadata that bind web chat turns to the same mutation history.
_Avoid_: run, transaction, checkpoint

**Agent Workspace**:
A web app workspace centered on one unrestricted Agent Session, with chat, activity, and Graph Wiki projections visible together.
_Avoid_: agent mode, approval flow

**Agent Activity Log**:
A human-facing projection of an Agent Session's persisted operation and activity records.
_Avoid_: approval queue, separate audit log

**Source Document Ingestion**:
The workflow that imports a Source Document, creates rebuildable Source Text Projections, and lets agents synthesize cited Wiki Pages from the document.
_Avoid_: section ontology, heading graph, arbitrary chunking

**Ingestion Chunk**:
A token-budgeted slice of a Source Document processed as one agent-readable unit during Source Document Ingestion.
_Avoid_: arbitrary chunk, page batch

**Manual Link**:
An agent-created relationship between Wiki Pages or other graph records, created only when explicitly requested.
_Avoid_: automatic link, inferred edge

**Graph Retrieval**:
A query process that over-fetches candidates with SurrealDB full-text and
vector search, then reranks those candidates with graph connectivity,
citations, and manual links.
_Avoid_: RAG, similarity search

**Source Document Page**:
A web app view for listing Source Documents and reading a selected Source Document alongside its graph-derived metadata.
_Avoid_: file browser, document editor

## Relationships

- A **Graph Wiki** contains many **Source Documents** and many **Wiki Pages**.
- A **Source Document** may have many **Source Text Projections**.
- A **Source Text Projection** is derived from a **Source Document** and can be rebuilt from it.
- A **Wiki Page** has one **Page Body**.
- A **Wiki Page** uses **Citations** to point to supporting **Source Documents**.
- A **Page Body** may contain Citation Markers, but Citation targets live in graph relations.
- A **Projection** is derived from graph state and is not the canonical source of truth.
- An **Agent Session** writes one or more **Change Log** entries.
- An **Agent Workspace** is centered on one **Agent Session**.
- An **Agent Activity Log** is derived from persisted **Agent Session** activity and Change Log records.
- A **Change Log** entry describes one mutation to Graph Wiki state.
- **Source Document Ingestion** creates per-page Source Text Projections for paginated Source Documents.
- **Source Document Ingestion** may use **Ingestion Chunks** sized to a practical agent context budget.
- A **Manual Link** may connect Wiki Pages or other graph records.
- **Graph Retrieval** ranks graph records using both relevance and graph authority.
- A **Source Document Page** shows many **Source Documents** and can render the selected Source Document as a human reading Projection.

## Example Dialogue

> **Dev:** "Should agents update markdown files when they ingest a PDF?"
> **Domain expert:** "No. The Graph Wiki is canonical. Agents update Wiki Pages and Citations in the graph; markdown-like output is only a Projection."

## Flagged Ambiguities

- "document" can mean raw trusted material or agent-authored synthesis. Resolved: use **Source Document** for raw trusted material and **Wiki Page** for synthesis.
- "reference" can mean source metadata, a citation, or a graph edge. Resolved: use **Citation** for the relationship from synthesis to Source Document evidence, and keep precise location data as citation-local locator metadata.
- Extracted headings or sections are not domain concepts. Resolved: do not model **Source Headings** or **Source Anchors** as graph records; store paginated source text as per-page **Source Text Projections**.
- Wiki Page content should not absorb metadata, citations, or links. Resolved: a **Wiki Page** has a **Page Body** for prose synthesis, while citations, metadata, and links live in graph records and relations.
- Inline citation syntax is a projection concern. Resolved: a **Citation Marker** appears in the Page Body, while the **Citation** graph relation is canonical.
- Document linking is deliberately agent-driven for the first proof of concept. Resolved: only create **Manual Links** on explicit trigger.
- Source text is not copied into Wiki Pages or treated as canonical evidence.
  Resolved: Source Documents stay in file buckets as immutable evidence;
  Source Text Projections may store lossy extracted page text, page numbers,
  provenance, and embeddings as rebuildable search caches.
- Search requests can mean different jobs. Resolved: use **Graph Retrieval**
  for answer retrieval, concept reuse checks for finding existing Wiki Pages
  before creating new ones, evidence search for finding Source Documents or
  Source Text Projections, and graph neighborhood inspection for traversing
  citations and Manual Links around known records.
- Explicit contradiction modeling is important but deferred until after the
  first proof of concept. Resolved: represent contradictions in Wiki Page prose
  with clear citation markers and graph evidence first; do not hardcode a
  contradiction schema until real workflows show the needed shape.
- Agent write controls are intentionally deferred. For the first proof of concept, agents may mutate Graph Wiki state directly, and the **Change Log** is the mitigation mechanism for inspecting and undoing bad agent actions.
- "log" can mean mutation history, runtime activity, or approval history. Resolved: the **Change Log** remains mutation history, while the **Agent Activity Log** is a human-facing projection of persisted session activity and is not an approval queue.
