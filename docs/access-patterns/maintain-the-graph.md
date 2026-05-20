# Maintain The Graph

This access pattern covers deliberate graph maintenance: reading through graph
state, merging pages, tightening citations, adjusting links, and evolving the
Domain Model.

Maintenance differs from ordinary indexing or question answering. The agent is
allowed to change structure, but should make each structural decision explicit
and auditable.

## Default Flow

1. Choose a maintenance target:
   - duplicate pages
   - weak Manual Links
   - broad citations
   - stale projections or embeddings
   - unframed records
   - confusing page scope
   - repeated unknown source shapes
2. Inspect the affected records and their neighborhoods.
3. Validate citations before moving or deleting claims.
4. Decide whether the issue is:
   - a graph data cleanup
   - a citation locator cleanup
   - a page merge/split
   - a Domain Model/frame change
   - an extraction/indexing problem
5. Apply the smallest change that makes the graph more coherent.
6. Run lint and record the maintenance action.

## Case: Duplicate Or Overlapping Wiki Pages

Expected behavior:

- compare titles, aliases, scope notes, bodies, citations, and neighborhoods
- decide whether one page should redirect/merge into another or whether scopes
  should be split
- preserve all citation evidence
- keep aliases on the surviving page when they improve search
- update Manual Links and Citations to point at the surviving or split pages

Do not delete a page until its cited claims are either migrated or explicitly
discarded as invalid.

## Case: Page Scope Is Wrong

A page may be too broad, too narrow, or using the wrong semantic role.

Expected behavior:

- add or revise `scope_note`
- split claims into separate pages if they represent distinct concepts,
  procedures, requirements, or components
- change frame assignment when the page is misclassified
- keep old citations attached to the claims they actually support

This is graph cleanup, not Domain Model evolution, unless the existing frames
cannot represent the corrected scope.

## Case: Manual Link Is Weak Or Vague

Current example: a Manual Link with reason `related` is linted as weak.

Expected behavior:

- replace vague reasons with actionable relationship reasons
- use an allowed label only when it captures the relationship
- remove links that cannot be justified
- prefer Citation edges for evidence support rather than page-to-page
  `related evidence` links when the source evidence is direct

If a needed label is missing repeatedly, create a Domain Model or relation
vocabulary proposal rather than inventing ad hoc labels.

## Case: Citation Is Too Broad

The current graph cites Source Headings directly. This is fine as the default,
but a multi-page heading citation should carry citation-local locator fields.

Expected behavior:

- add page range when known
- add claim supported by the citation
- add short quote/context when available
- attach Source Text Projection ID and text hash when available
- do not create a separate evidence node by default

Promote evidence into a reusable evidence object only when it has independent
value across multiple pages, claims, or maintenance workflows.

## Case: Citation Is Incorrect Or Stale

Expected behavior:

- verify whether the citation marker still exists in the page body
- verify that the Citation key matches the marker
- verify the Source Heading exists
- verify page range is inside the heading range when the heading has an
  `end_page`
- verify quote/context against the referenced projection when possible
- repair the locator or citation target rather than weakening evidence

If the source no longer supports the claim, remove or rewrite the claim.

## Case: Source Extraction Is Wrong

Examples:

- duplicate Source Headings from an old import path
- missing `end_page`
- headings attached to a missing Source Document
- Source Text Projection has no embedding
- projection text hash no longer matches the locator

Expected behavior:

- distinguish extraction/index repair from knowledge cleanup
- rebuild projections or embeddings when safe
- avoid creating Wiki Pages from known-bad source structure
- record concrete operation failures when repair is blocked

This should usually be a maintenance task, not part of answer generation.

## Case: Records Are Unframed

When Domain Model tools exist, maintenance should identify high-value unframed
records.

Expected behavior:

- frame obvious records using existing frames
- leave uncertain records unframed with a proposal or note
- prioritize framed assignment for cited pages, cited headings, and high-rank
  retrieval results
- avoid bulk-framing all headings just because the title matches a keyword

Frame assignment is a semantic claim and should be auditable.

## Case: Existing Frame Fits Poorly

This is the core decision point for Domain Model evolution.

Convert input to match the existing Domain Model when:

- one existing frame captures the record without distortion
- the issue is missing metadata, weak citation locators, vague links, or missing
  scope notes
- the fix affects only one or two records
- the model already distinguishes the relevant semantic role

Change the Domain Model when:

- several records share a shape that no frame captures
- forcing the records into an existing frame loses important meaning
- the distinction would affect retrieval, learning, citation lint, or page
  promotion behavior
- agents repeatedly produce the same frame proposal
- the user explicitly asks for modeling work

If uncertain, create a frame proposal. Do not silently change the active Domain
Model during unrelated question answering.

## Case: Frame Or Relation Vocabulary Needs Tightening

Expected behavior:

- inspect examples and non-examples from the current graph
- define the semantic boundary
- define expected slots and allowed edges
- define lint rules and severities
- migrate or reclassify existing instances
- keep the old frame version available for audit when behavior changes

Domain Model changes should be versioned and reviewed like architecture
decisions, not treated as incidental metadata edits.

## Outputs

A successful maintenance pass may produce:

- merged or split Wiki Pages
- repaired Citation locators
- removed or clarified Manual Links
- rebuilt projections or embeddings
- frame assignments or frame proposals
- Domain Model frame revisions
- follow-up issues for blocked repairs

It should not produce:

- silent deletion of cited claims
- unsupported relationship labels
- bulk frame assignments without review
- Domain Model changes with no concrete graph examples
