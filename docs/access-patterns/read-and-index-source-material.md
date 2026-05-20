# Read And Index Source Material

This access pattern covers an agent reading a page, section, or chapter of a
trusted source and turning important material into maintained graph knowledge.

The goal is not to create a Wiki Page for every heading. The goal is to promote
high-value concepts, requirements, procedures, architectures, components, and
use cases into durable graph records with precise enough evidence to audit.

## Default Flow

1. Identify the source context:
   - Source Document
   - containing Source Heading
   - page range being read
   - Source Text Projection or ingestion chunk, if available
2. Extract candidate knowledge objects:
   - source-backed concepts
   - requirement sets
   - use cases
   - reference architectures
   - procedures
   - technology components
   - examples or evidence-only material
3. Search existing Wiki Pages and aliases before creating anything.
4. Decide whether each candidate should become:
   - a new Wiki Page
   - an update to an existing Wiki Page
   - a citation on an existing page
   - a Manual Link or proposed semantic edge
   - no durable graph object yet
5. Capture citation-local evidence:
   - Source Heading target
   - page range
   - claim being supported
   - short quote or normalized excerpt when available
   - context before/after when useful
   - Source Text Projection ID and text hash when available
6. Run graph lint or citation validation for the changed records.

## Case: Source Document Does Not Exist

If the document is not imported, the agent should not create source-backed Wiki
Pages from an untrusted local file or memory.

Expected behavior:

- import the Source Document if the user has provided it as trusted material
- extract headings before creating citations
- if import is out of scope, report that the graph cannot yet cite the source
- do not create placeholder citations to nonexistent records

This is a hard stop for source-backed claims.

## Case: Source Document Exists But Headings Are Missing

The document may be imported while heading extraction has not run or failed.

Expected behavior:

- run heading extraction for the document
- verify page coverage before creating citations
- if headings cannot be extracted, create a concrete follow-up issue or report
  the operation and failure reason

Do not cite the whole Source Document as a substitute unless the CLI explicitly
supports document-level citations and the source is very short.

## Case: Heading Exists But Projection Is Missing

The agent can still cite the Source Heading, but search and locator validation
will be weaker.

Expected behavior:

- create or rebuild the Source Text Projection when the page range is needed for
  repeated work
- otherwise record the citation with page range and quote/context from the
  source reading operation
- mark locator status as lower confidence if the quote cannot be validated
  against a projection

This should be a warning, not a blocker.

## Case: Heading Exists But Is Too Broad

Many current headings span several pages or entire sections. A citation to such
a heading is usable but too coarse without locator fields.

Expected behavior:

- cite the containing Source Heading
- add citation-local page range
- add quote/context or evidence note
- add the exact claim supported by that citation
- do not create a separate evidence node unless the evidence becomes reusable

Lint should warn when a multi-page heading citation has no page range or
locator.

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

## Case: The Candidate Is A New Concept

Example: the agent reads page 30 and identifies "Spanning Tree Protocols" as a
new concept.

Expected behavior:

- search for `Spanning Tree Protocol`, `Spanning Tree Protocols`, and `STP`
- create a concept Wiki Page only if the topic is important enough to retrieve
  or teach later
- set `page_kind = concept`
- add a scope note and aliases
- cite the source heading with page-local locator fields
- frame it as a source-backed concept when Domain Model tools exist

The agent should not automatically add prerequisites or contrast edges unless
the source supports them.

## Case: The Candidate Is Not A Concept

Many useful headings are procedures, components, requirement sets, or reference
material rather than concepts.

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

## Case: Source Material Contradicts Or Revises Existing Graph Knowledge

Expected behavior:

- do not silently overwrite the existing page
- add a citation for the new evidence
- mark conflict, supersession, or uncertainty explicitly
- create a maintenance task if the contradiction requires review

Until contradiction modeling exists, the page body should say the graph contains
conflicting or newer evidence.

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
- broad heading citations without locator fields when page-local evidence is
  known
- Domain Model changes unless a repeated shape cannot fit existing frames
