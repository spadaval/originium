# Graph Wiki Access Patterns

These reference documents enumerate the main ways an agent is expected to use
Originium before the frame-guided metadata, citation, and schema-lint design is
finalized.

The current graph is source-heavy and synthesis-light: many Source Documents,
a smaller set of Source Text Projections, and only a few Wiki Pages,
Citations, and Manual Links. Extracted document headings, outline entries, and
page-section labels are useful projection metadata, but they are not durable
graph entities. The access patterns should therefore optimize for disciplined
promotion from source material into durable graph knowledge without forcing
agents to manage document structure as ontology.

## Agent And CLI Split

The agent should provide judgment. The CLI should provide precise, repeatable
graph operations.

The agent is responsible for:

- deciding whether material is important enough to promote from source evidence
  into Wiki Pages
- choosing the semantic role of a candidate record, such as concept, procedure,
  requirement set, reference architecture, technology component, or
  source-only reference material
- deciding when an existing page is the right home for a claim versus when the
  graph needs a split, merge, redirect, or frame proposal
- explaining uncertainty, conflict, missing evidence, and scope decisions to the
  user
- proposing Domain Frame changes when repeated graph examples no longer fit the
  active frame catalog

The CLI is responsible for:

- finding candidate pages, source projection spans, citations, links, frames,
  and neighborhoods without relying on the agent's memory
- creating citations from source locators with stable validation fields instead
  of expecting the agent to hand-write perfect citation records
- linting pages, citations, links, frames, and source projections before and
  after mutation
- performing refactors such as page merge, page split, alias migration, citation
  retargeting, link rewrites, projection rebuilds, and embedding reindexing
- recording concrete change logs for every read, write, lint result, and
  refactor

The practical rule is: if an operation requires semantic judgment, the agent
decides; if an operation requires exact graph mutation, citation precision,
index consistency, or repeated validation, the CLI must own it.

## CLI Affordance Families

These access patterns imply a few high-leverage CLI families:

- Search tools: page candidate search, evidence search over Source Documents and
  projections, frame/role search, graph-neighborhood search, duplicate
  detection, and projection lookup.
- Citation tools: create a citation from a source locator, validate citation
  markers, narrow a broad document-local locator, retarget citations during page
  refactors, and report unsupported claims.
- Lint tools: page lint, citation lint, link lint, frame lint, source extraction
  lint, stale projection lint, and graph consistency lint.
- Refactor tools: merge pages, split pages, rename pages, move claims between
  pages, migrate aliases, rewrite Manual Links, retarget citations, rebuild
  projections, and reindex embeddings.
- Proposal tools: create frame proposals, unresolved evidence notes,
  cited conflict notes, and follow-up maintenance issues without mutating the
  active frame catalog prematurely. Relation-label proposal/search primitives
  are deferred until frame workflows show a concrete need.

## Patterns

- [Read And Index Source Material](read-and-index-source-material.md): process a
  page, section, or chapter and create or update Wiki Pages for highly relevant
  topics.
- [Answer A Question](answer-a-question.md): answer from existing graph
  knowledge, creating or updating pages when the maintained graph is missing or
  insufficient.
- [Maintain The Graph](maintain-the-graph.md): merge pages, repair citations,
  tighten links, refine Domain Frames, and keep graph state coherent.

## Cross-Cutting Rules

- Source Documents are canonical evidence inventory, not compiled knowledge.
- Extracted headings, outline paths, page ranges, and projection spans are
  locator metadata. They should help agents read and cite sources, but should
  not become first-class graph records.
- Wiki Pages are the maintained synthesis layer.
- Citations are claim-to-evidence edges. Citation-local locators should carry
  Source Document target, page range, quote/context, projection identity/hash,
  and claim metadata when available.
- Domain Frames should guide classification, metadata slots, linting, and
  extraction. They should not be casually changed during ordinary question
  answering.
- A frame assignment is a semantic claim. If uncertain, propose or flag rather
  than silently forcing a record into the nearest frame.
- Source Document metadata belongs on Source Documents, Wiki Page semantic
  metadata belongs on Wiki Pages through frame assignments, and Citation
  metadata belongs on Citation locators.
- Manual Links are explicit navigation edges. Use Citations for evidence and
  frame metadata for semantic classification.
- Graph maintenance should make failures concrete: name the record, operation,
  input, reason, and next action.

## Current Example Shapes

The current source corpus already suggests useful first frames. These examples
should be recognized from Source Document titles, outline metadata, projection
spans, and Wiki Page synthesis rather than from first-class source-structure
records:

- Source-backed concept: `wiki_page:autonomous_operations`
- Requirement set: source sections such as `System Requirements`, `Quality of Service
(QoS) Requirements`, and `Network Requirements`
- Use case: source sections such as `Mining Use-Cases and Requirements` and `Offshore
Wind Farm Use Cases`
- Reference architecture: source sections such as `Rail CBTC and Safety Reference
Architecture` and `Cisco Substation Automation Reference Architecture`
- Procedure: source sections such as `Configure the FAN REP Ring Using the REP
Workflow` and `CURWB Device Initial Setup and Configuration`
- Technology component: source sections such as `Cisco Ultra-Reliable Wireless Backhaul
(CURWB) Overview`, `Wireless Network Components`, and `Cisco IE3x00 Rugged
Industrial Switches`
