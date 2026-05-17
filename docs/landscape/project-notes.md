# Project Notes

This file records the important concepts and product/technical approaches from
the inspected systems. It focuses on what matters for Originium's CLI-first
source-backed graph and proposed learning capability.

## LLM Wiki Compilers

### Kompl

[Kompl](https://github.com/tuirk/Kompl) is a local "knowledge compiler" that
turns sources into an interlinked wiki before query time. Its useful stance is
compile-time synthesis: sources are ingested, concepts/entities are extracted,
aliases are resolved, pages are planned, drafts are generated, backlinks are
created, and pages are committed with provenance.

Useful ideas:

- Make ingestion a visible staged pipeline with concrete progress and retryable
  steps: extract, resolve, match, plan, draft, cross-reference, commit.
- Prefer persistent synthesized pages and graph structure over query-time-only
  RAG when the corpus is curated and reused.
- Promote entities or concepts only after they cross explicit mention or
  relevance thresholds.
- Return pre-synthesized pages with provenance through the retrieval/MCP
  surface.

Risks:

- Long dense inputs need explicit chunking. Kompl calls out truncation and the
  absence of automatic chunking for very long sources.
- Source-summary pages that reproduce large portions of source text blur the
  line between canonical source material and rebuildable projections.
- An LLM extraction pipeline needs salvage, retry, and schema validation because
  structured responses fail in practice.

### OmegaWiki

[OmegaWiki](https://github.com/skyllwt/OmegaWiki) is an agent-operated research
wiki with typed entities for papers, concepts, methods, ideas, experiments,
people, topics, and foundations. It uses schema files, JSONL graph edges,
citations, deterministic tools, and agent skills as workflow contracts.

Useful ideas:

- Treat schema as an operating contract, not just documentation.
- Separate bibliographic citations from semantic graph edges.
- Give semantic edges endpoint constraints, evidence, confidence, and linting.
- Model lifecycle state for research ideas and experiments.
- Keep discovery proposal-only until ingestion/review accepts a source.
- Run deterministic checks for links, fields, graph edges, citations, and
  semantic health.

Risks:

- File-native wiki state is not Originium's storage model. The useful part is
  the contract and lint discipline, not Markdown as canonical state.
- Agent-edited graph files need strict append/dedup tools to avoid drift.

### Atomic

[Atomic](https://github.com/kenforthewin/atomic) is a personal knowledge base
with Markdown atoms, chunks, embeddings, tags, semantic edges, wiki synthesis,
citations, chat, and visual canvas views. Its core logic is in Rust, with thin
Tauri/server/MCP wrappers.

Useful ideas:

- Make background coalescing durable: atom updates enqueue chunking, embedding,
  tagging, graph maintenance, and progress events.
- Keep wiki synthesis proposal-oriented, with citations to atom chunks and
  version history for accepted wiki articles.
- Use hybrid search with vector and keyword paths, plus tag scoping.
- Keep application state isolated per database or workspace.

Risks:

- Semantic edges from similarity are useful suggestions, not reviewed graph
  facts.
- Background pipelines need visible activity and failure states.
- Learner state should not leak across workspaces, corpora, or graph versions.

## PKM And Graph Notebooks

### Logseq

[Logseq](https://github.com/logseq/logseq) is an outliner-first PKM system with
pages, blocks, references, backlinks, DataScript/Datalog query behavior, SQLite
DB graphs, and Markdown mirror/export paths.

Useful ideas:

- Separate durable identity from display title/path.
- Materialize reverse references so navigation is fast and explainable.
- Use exact title, full-text, fuzzy, and graph-backed retrieval modes.
- Provide export/mirror affordances when the internal graph is canonical.

Risks:

- A graph database path without strong backup/export messaging creates trust
  problems. Logseq explicitly warns users about DB graph data-loss risk.
- Markdown mirror semantics must be clear: source of truth or projection, not
  both.

### Trilium

[Trilium](https://github.com/TriliumNext/Trilium) is a hierarchical personal
knowledge base with notes, branches, clones, attributes, labels, relations,
blobs, revisions, sync, scripting, encryption, relation maps, and link maps.

Useful ideas:

- A branch table supports multiple parents/clones without duplicating content.
- Labels and named note-to-note relations make graph structure queryable.
- Lazy blob loading avoids dragging large note bodies through every operation.
- Revision and sync ledgers make changes observable.

Risks:

- A single overloaded "attribute" abstraction becomes powerful but hard to
  approach. Originium should expose common graph actions through direct CLI
  verbs before asking users to learn a query language.

### Tesseract

[Tesseract](https://github.com/geckse/tesseract-md-app) is an Obsidian-compatible
local Markdown app backed by the `mdvdb` CLI for vector search, BM25, hybrid
RRF ranking, link traversal, clustering, schema inference, and JSON outputs.

Useful ideas:

- Keep indexer operations agent-friendly: JSON output, `doctor`, `links`,
  `backlinks`, `orphans`, `schema`, and graph neighborhood commands.
- Use content hashes to skip unchanged files.
- Combine semantic, lexical, graph, and metadata filters in retrieval.
- Prefer local graph neighborhoods and backlink panels as explainability tools.

Risks:

- Global or 3D graph visualization is not proof of retrieval quality.
- Auto-inferred relationships need provenance and status separation.

## Adaptive Learning And Scheduling

### OATutor

[OATutor](https://github.com/CAHLR/OATutor) is an open-source adaptive tutor
using Bayesian Knowledge Tracing over knowledge components. Problems contain
steps, steps map to KCs through a skill model, and item selection uses mastery
thresholds and heuristics.

Useful ideas:

- Use a Q-matrix-like mapping from learning items or responses to skills.
- Keep mastery per learner and per skill, not on source concepts themselves.
- Record response events with item IDs, step IDs, correctness, hints, lesson
  context, and assessed KCs.
- Start with simple item-selection heuristics before overfitting a tutor model.

Risks:

- External spreadsheet/content pipelines are hard to audit unless their outputs
  become source-backed graph records.
- A threshold such as 0.95 can be useful operationally, but it should not become
  a universal claim of understanding.

### Anki

[Anki](https://github.com/ankitects/anki) is the strongest reference for durable
review logs and scheduling state. It separates notes, note types, templates,
cards, revlog entries, and scheduler state. FSRS models memory through stability
and difficulty.

Useful ideas:

- Store immutable review events and derive scheduling state.
- Separate authored content from generated review items.
- Keep review buttons/outcomes explicit: again, hard, good, easy.
- Treat scheduling fields as projections over review history, not the only
  record of learning.

Risks:

- Card-level scheduling is not concept mastery. Originium needs both learning
  item state and concept/skill projections.
- Spaced repetition alone does not solve prerequisite ordering.

### pyBKT

[pyBKT](https://github.com/CAHLR/pyBKT) estimates mastery from ordered learner
response sequences. It is not a scheduler; it expects data with learner,
correctness, skill, item/resource mappings and fits BKT variants.

Useful ideas:

- Define a strict learner-event data contract early.
- Include model version, skill ID, learner ID, item ID, correctness, timestamp,
  and graph version in observations.
- Keep BKT output as a derived learner-state projection.

Risks:

- BKT assumes a known skill model and response sequence. LLM-generated learning
  items need reviewable `response_assesses` edges before they can safely update
  mastery.

## Agent Memory And Retrieval KBs

### Basic Memory

[Basic Memory](https://github.com/basicmachines-co/basic-memory) is an
AI-oriented memory system where Markdown files are durable and graph/search
state is derived. It exposes entities, observations, and directed relations,
with CLI and MCP surfaces.

Useful ideas:

- Keep rebuild/reset commands that delete only indexes, not source records.
- Model observations and relations separately.
- Use readable directed relation syntax as an authoring surface.
- Search first, then hydrate graph context through a build-context command.

Risks:

- Markdown source of truth is a product decision. Originium should keep
  SurrealDB canonical and use text projections as export or inspection views.

### Engram

[Engram](https://github.com/cylian-org/engram) is a compact MCP memory server
with Markdown entries, rebuildable search backends, typed `kb://uuid#type`
relations, and simple tools such as remember, recall, search, forget, rebuild.

Useful ideas:

- Keep indexes disposable and rebuildable from durable records.
- Make memory navigation relation-aware: recall should expose incoming and
  outgoing relations.
- Be explicit about what belongs in memory: decisions, diagnostics, procedures,
  and root causes, not facts that are trivially rediscoverable.

Risks:

- UUID-only links are durable but not a good human authoring surface.

### Textrawl

[Textrawl](https://github.com/jeffgreendesign/textrawl) is an MCP-first
personal knowledge server with documents, memory, conversations, insights,
Postgres, pgvector, hybrid search, entity extraction, relation extraction, and
structured MCP responses.

Useful ideas:

- Return structured content alongside human-readable text for agent tools.
- Batch memory writes should report partial success precisely.
- Hybrid search should expose the selected mode and fallback behavior.
- Embedding provider and dimension choices need explicit status and migration
  paths.

Risks:

- Retrieval should not fail entirely when embeddings are not configured.
- Fixed relation/entity enums can become too rigid for evolving source graphs.

## Formal Knowledge Graph References

### NeuralKG

[NeuralKG](https://github.com/zjukg/NeuralKG) is a KG representation-learning
framework for link prediction over benchmark triples. It treats graph data as
entity/relation dictionaries plus train/valid/test triples.

Useful ideas:

- Link prediction may be useful for suggestions: "this edge might exist" or
  "these concepts may be related."
- Evaluation discipline matters; ranking metrics are useful for derived models.

Risks:

- Integer IDs and triple files are not a usable graph authoring model.
- Link prediction is not evidence, provenance, or truth.
- Dynamic graph evolution can require retraining or inductive models.

### ORKG, SemTK, Semantic MediaWiki

[ORKG](https://www.orkg.org/) models scholarly knowledge through papers,
contributions, properties, resources, literals, classes, comparisons, and graph
views. [SemTK](https://github.com/ge-semtk/semtk) is ontology-first and builds
stored visual query shapes over RDF/SPARQL data. [Semantic MediaWiki](https://www.semantic-mediawiki.org/)
adds semantic annotations and RDF export to wiki pages.

Useful ideas:

- A single source document can contain multiple contribution-like subnodes.
- Relation vocabularies need reuse pressure and review to avoid property drift.
- Draft versus published graph states are useful for reports and comparisons.
- SHACL-like validation concepts can help even if Originium does not expose RDF.
- PROV-style provenance is the right direction for portable assertion lineage.

Risks:

- RDF/SPARQL should not be the only product interface early.
- Ontology evolution breaks saved queries and import mappings unless versioned.
- Per-page revision history is not enough; Originium needs assertion-level
  provenance.
