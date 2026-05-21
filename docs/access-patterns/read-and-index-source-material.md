# Read And Index Source Material

This access pattern covers an agent reading a page, section, or chapter of a
trusted source and turning important material into maintained graph knowledge.

The goal is not to create a Wiki Page for every source section or projection
span. The goal is to promote high-value concepts, requirements, procedures,
architectures, components, and use cases into durable graph records with precise
enough evidence to audit.

## Agent And CLI Split

The agent decides what the source material means and what deserves durable
promotion. The CLI should perform the exact source lookup, projection lookup,
page matching, citation construction, validation, and index updates.

Agent judgment:

- identify candidate knowledge objects in the page or chapter
- decide whether each candidate is durable knowledge, evidence-only reference
  material, or noise
- choose the best existing frame or propose a new one when the material does
  not fit
- decide whether to update an existing Wiki Page, create a new page, or leave
  the material in source inventory
- write the synthesis and explain uncertainty or conflicts

CLI responsibility:

- locate the Source Document, document-local page range, projection span, and
  text hash for the material being read
- search candidate Wiki Pages and aliases before writes
- create citations from source locators and validate that markers, graph edges,
  page ranges, quotes, and projections agree
- lint the changed page, citation set, links, frame assignment, and source
  projection coverage
- reindex changed pages and projections after writes

The agent should not manually assemble citation records beyond supplying the
Source Document locator, supported claim, and selected excerpt. The CLI should
turn that input into a validated Citation edge and locator payload. Extracted
headings, outline paths, and page-section labels may be stored in the locator
payload or projection metadata, but they should not be Citation targets.

## Default Flow

1. CLI identifies or verifies the source context:
   - Source Document
   - page range or quote/context being read
   - containing outline path or section label, if extraction found one
   - Source Text Projection span or ingestion chunk, if available
2. Agent extracts candidate knowledge objects:
   - source-backed concepts
   - requirement sets
   - use cases
   - reference architectures
   - procedures
   - technology components
   - examples or evidence-only material
3. CLI searches existing Wiki Pages, aliases, frames, and nearby graph records
   before creating anything.
4. Agent decides whether each candidate should become:
   - a new Wiki Page
   - an update to an existing Wiki Page
   - a citation on an existing page
   - a Manual Link or proposed semantic edge
   - no durable graph object yet
5. CLI creates citation-local evidence records from agent-supplied locator
   input:
   - Source Document target
   - page range
   - claim being supported
   - short quote or normalized excerpt when available
   - context before/after when useful
   - Source Text Projection ID and text hash when available
6. CLI runs graph lint, citation validation, and reindexing for changed
   records.

## Case: Source Document Does Not Exist

If the document is not imported, the agent should not create source-backed Wiki
Pages from an untrusted local file or memory.

Expected behavior:

- import the Source Document if the user has provided it as trusted material
- extract or rebuild projection/outline metadata before creating citations when
  that metadata is needed to validate the locator
- if import is out of scope, report that the graph cannot yet cite the source
- do not create placeholder citations to nonexistent records

CLI support needed:

- `source find` by file path, title, fingerprint, and corpus
- `source import` with clear trust/corpus metadata
- `source diagnostics` with page/projection coverage reporting

This is a hard stop for source-backed claims.

## Case: Source Document Exists But Projection Metadata Is Missing

The document may be imported while projection, outline, or page-section
extraction has not run or failed.

Expected behavior:

- run projection or outline extraction for the document
- verify page coverage before creating citations
- if useful section metadata cannot be extracted, create a concrete follow-up
  issue or report the operation and failure reason

CLI support needed:

- source diagnostics that report missing page ranges, duplicate outline labels,
  and extraction confidence
- a lint rule that blocks citation locators when the cited page range is outside
  the Source Document or cannot be validated against available projection
  metadata

Do not use a whole-document citation as a substitute unless the CLI explicitly
supports document-level citations and the source is very short.

## Case: Source Document Exists But Projection Is Missing

The agent can still cite the Source Document with page range and quote/context,
but search and locator validation will be weaker.

Expected behavior:

- create or rebuild the Source Text Projection when the page range is needed for
  repeated work
- otherwise record the citation with page range and quote/context from the
  source reading operation
- mark locator status as lower confidence if the quote cannot be validated
  against a projection

This should be a warning, not a blocker.

## Case: Locator Is Too Broad

Many current source sections span several pages or entire chapters. A citation
to the whole Source Document or broad section label is usable only when the
citation-local locator carries enough detail.

Expected behavior:

- cite the Source Document
- add citation-local page range
- add quote/context or evidence note
- add the exact claim supported by that citation
- do not create a separate evidence node unless the evidence becomes reusable

Lint should warn when a citation has no page range, claim, quote/context, or
projection locator and the target Source Document is longer than a short note.

CLI support needed:

- a `cite` flow that accepts a Source Document plus page, paragraph, quote, or
  context locator and produces the citation payload
- a citation narrowing command that upgrades broad citations when the agent
  later supplies a better locator

## Case: The Candidate Topic Already Has A Wiki Page

The agent should update the existing page rather than create a duplicate.

Expected behavior:

- read the existing page
- validate current citations
- append or patch the specific claim
- add a new Citation if the new source supports a new claim
- add aliases only when they improve future lookup

If the existing page has the wrong scope, prefer a maintenance action: split,
rename, or add a scope note.

CLI support needed:

- page candidate search tuned for reuse, not just answer retrieval
- page patch support that preserves citation markers and validates the resulting
  Citation edge set
- duplicate warnings when a new title or alias overlaps an existing page

## Case: The Candidate Is A New Concept

Example: the agent reads page 30 and identifies "Spanning Tree Protocols" as a
new concept.

Expected behavior:

- search for `Spanning Tree Protocol`, `Spanning Tree Protocols`, and `STP`
- create a concept Wiki Page only if the topic is important enough to retrieve
  or teach later
- set `page_kind = concept`
- add a scope note and aliases
- cite the Source Document with citation-local locator fields
- frame it as a source-backed concept when Domain Model tools exist

The agent should not automatically add prerequisites or contrast edges unless
the source supports them.

CLI support needed:

- concept or page creation that requires a scope note, aliases, frame assignment
  or frame proposal, and at least one citation for source-backed claims
- citation validation before the page becomes eligible for retrieval ranking

## Case: The Candidate Is Not A Concept

Many useful source sections are procedures, components, requirement sets, or
reference material rather than concepts.

Examples:

- `CURWB Device Initial Setup and Configuration` is likely a procedure.
- `Wireless Network Components` is likely component/reference material.
- `Quality of Service (QoS) Requirements` is likely a requirement set.
- `Single-Frequency Architecture for Small Mine Deployments` is likely a
  reference architecture.

Expected behavior:

- classify the candidate under the best existing frame
- create a Wiki Page only when durable synthesis is useful
- otherwise leave it as source evidence and add frame metadata/proposals later
- do not force everything into `page_kind = concept`

CLI support needed:

- frame search and frame examples so the agent can compare candidate roles
- evidence-only annotation or proposal commands for useful source regions that
  should not become teachable Wiki Pages yet

## Case: Source Material Contradicts Or Revises Existing Graph Knowledge

Expected behavior:

- do not silently overwrite the existing page
- add a citation for the new evidence
- mark conflict, supersession, or uncertainty explicitly
- create a maintenance task if the contradiction requires review

Until contradiction modeling exists, the page body should say the graph contains
conflicting or newer evidence.

CLI support needed:

- conflict lint that detects incompatible claims or competing citations when the
  agent flags a contradiction
- contradiction or supersession note creation that does not require immediately
  changing the Domain Model

## Outputs

A successful indexing pass may produce:

- new or updated Wiki Pages
- new Citations with precise locators
- Manual Links or proposed semantic edges
- frame assignments or frame proposals
- follow-up maintenance issues for extraction failures, duplicates, or unclear
  scope

It should not produce:

- uncited source-backed claims
- duplicate pages for the same concept
- broad Source Document citations without locator fields when page-local
  evidence is known
- Domain Model changes unless a repeated shape cannot fit existing frames
