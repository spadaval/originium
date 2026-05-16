# Graph Wiki

A Graph Wiki is a persistent, agent-maintained knowledge base that compiles trusted source documents into structured, linked pages stored in a graph database.

## Language

**Graph Wiki**:
A structured wiki whose canonical state lives in a graph database rather than markdown files.
_Avoid_: knowledge graph, wiki, RAG index

**Source Document**:
A trusted raw document that the Graph Wiki reads from but does not treat as agent-authored synthesis.
_Avoid_: document, file, reference

**Wiki Page**:
An agent-maintained synthesis record about a topic, entity, question, or other durable subject in the Graph Wiki.
_Avoid_: markdown page, concept cache

**Page Body**:
The prose synthesis of a Wiki Page, separate from citations, metadata, and graph links.
_Avoid_: content object, markdown file

**Source Anchor**:
A citation target inside a Source Document, normally a document heading or chapter section rather than an exact text span.
_Avoid_: citation, reference, link, text span

**Source Heading**:
A heading extracted from a Source Document that can be used as a stable Source Anchor.
_Avoid_: PDF heading, chapter heading, section label

**Citation**:
A relationship from wiki synthesis back to one or more Source Anchors that support it.
_Avoid_: reference, link

**Citation Marker**:
A stable inline marker in a Page Body that points to a Citation graph relation.
_Avoid_: raw source address, inline reference

**Projection**:
A rendered view of graph data for humans or agents, such as markdown-like text generated from Wiki Pages and their linked records.
_Avoid_: canonical markdown, export

**Change Log**:
An append-only record of Graph Wiki accesses and edits used to inspect and undo agent work.
_Avoid_: event store, revision history

**Agent Session**:
A bounded unit of agent work whose Graph Wiki mutations can be reviewed through the Change Log.
_Avoid_: run, transaction, checkpoint

**Chapter Ingestion**:
The workflow that processes one chapter or major Source Heading at a time while preserving cross-references to other Source Headings and Wiki Pages.
_Avoid_: whole-document ingestion, chunking

**Ingestion Chunk**:
A token-budgeted slice of a Source Document processed as one agent-readable unit during Chapter Ingestion.
_Avoid_: arbitrary chunk, page batch

**Manual Link**:
An agent-created relationship between Wiki Pages, Source Headings, or other graph records, created only when explicitly requested.
_Avoid_: automatic link, inferred edge

**Graph Retrieval**:
A query process that combines text or vector relevance with graph connectivity to find authoritative Wiki Pages or Source Headings.
_Avoid_: RAG, similarity search

## Relationships

- A **Graph Wiki** contains many **Source Documents** and many **Wiki Pages**.
- A **Wiki Page** has one **Page Body**.
- A **Source Document** has many **Source Anchors**.
- A **Source Heading** can be used as a **Source Anchor**.
- A **Wiki Page** uses **Citations** to point to specific **Source Anchors**.
- A **Page Body** may contain Citation Markers, but Citation targets live in graph relations.
- A **Projection** is derived from graph state and is not the canonical source of truth.
- An **Agent Session** writes one or more **Change Log** entries.
- A **Change Log** entry describes one access or edit to Graph Wiki state.
- **Chapter Ingestion** creates or updates Wiki Pages one chapter or major Source Heading at a time.
- **Chapter Ingestion** uses **Ingestion Chunks** sized to a practical agent context budget.
- A **Manual Link** may connect Wiki Pages, Source Headings, or other graph records.
- **Graph Retrieval** ranks graph records using both relevance and graph authority.

## Example Dialogue

> **Dev:** "Should agents update markdown files when they ingest a PDF?"
> **Domain expert:** "No. The Graph Wiki is canonical. Agents update Wiki Pages and Citations in the graph; markdown-like output is only a Projection."

## Flagged Ambiguities

- "document" can mean raw trusted material or agent-authored synthesis. Resolved: use **Source Document** for raw trusted material and **Wiki Page** for synthesis.
- "reference" can mean source metadata, a precise citation, or a graph edge. Resolved: use **Source Anchor** for precise citation targets and **Citation** for the relationship from synthesis to evidence.
- Ultra-specific text-span citations are deliberately avoided for the first proof of concept. Resolved: citation anchors should target **Source Headings**.
- Wiki Page content should not absorb metadata, citations, or links. Resolved: a **Wiki Page** has a **Page Body** for prose synthesis, while citations, metadata, and links live in graph records and relations.
- Inline citation syntax is a projection concern. Resolved: a **Citation Marker** appears in the Page Body, while the **Citation** graph relation is canonical.
- Document linking is deliberately agent-driven for the first proof of concept. Resolved: only create **Manual Links** on explicit trigger.
- Source text is not copied into Wiki Pages or durable wiki records. Resolved: Source Documents stay in file buckets, Source Headings store navigational metadata, and ingestion reads source text from the file when needed.
- Explicit contradiction modeling is important but deferred until after the first proof of concept.
- Agent write controls are intentionally deferred. For the first proof of concept, agents may mutate Graph Wiki state directly, and the **Change Log** is the mitigation mechanism for inspecting and undoing bad agent actions.
