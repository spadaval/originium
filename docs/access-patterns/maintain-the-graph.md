# Maintain The Graph

This access pattern covers deliberate graph maintenance: reading through graph
state, merging pages, tightening citations, adjusting Wiki Page References,
simplifying source structure, and evolving the Domain Frame catalog.

Maintenance differs from ordinary indexing or question answering. The agent is
allowed to change structure, but should make each structural decision explicit
and auditable.

## Agent And CLI Split

The agent decides what structural change should happen and why. The CLI should
execute the graph refactor, preserve evidence, update indexes, and prove the
result is coherent.

Agent judgment:

- choose the maintenance target and explain why it matters
- decide whether two pages are duplicates, adjacent concepts, parent/child
  scopes, or legitimately separate records
- decide whether a weak pattern is a data cleanup issue or evidence that the
  frame catalog needs to evolve
- define frame boundaries, examples, non-examples, slots, and metadata semantics
- review lint failures and decide which repairs are semantically correct

CLI responsibility:

- inspect affected neighborhoods, citations, aliases, inbound Wiki Page
  References, outbound Wiki Page References, projections, and embeddings
- perform refactors atomically where possible: merge, split, rename, retarget,
  rebuild, and reindex
- preserve old identifiers, redirects, aliases, citation provenance, and change
  logs
- run before/after lint and produce concrete diffs of graph changes
- prevent destructive edits when cited claims would be orphaned or citations
  would be invalidated

The agent should not manually rewrite a large graph neighborhood. It should ask
the CLI for a proposed refactor plan, approve or adjust the semantic choices,
then let the CLI execute and validate the mechanical work.

## Default Flow

1. Choose a maintenance target:
   - duplicate pages
   - stale or misplaced Wiki Page References
   - legacy Manual Links
   - broad or stale citation locators
   - stale projections or embeddings
   - unframed records
   - confusing page scope
   - repeated unknown source shapes
2. CLI inspects the affected records, neighborhoods, citations, aliases, Wiki
   Page References, projections, embeddings, and lint state.
3. CLI validates citations before moving or deleting claims.
4. Agent decides whether the issue is:
   - a graph data cleanup
   - a citation locator cleanup
   - a page merge/split
   - a Domain Frame change
   - an extraction/indexing problem
5. CLI proposes the smallest refactor plan that makes the graph more coherent.
6. Agent approves, rejects, or revises semantic choices in the plan.
7. CLI applies the refactor, reruns lint, reindexes changed records, and records
   the maintenance action.

## Case: Duplicate Or Overlapping Wiki Pages

Expected behavior:

- compare titles, aliases, scope notes, bodies, citations, and neighborhoods
- decide whether one page should redirect/merge into another or whether scopes
  should be split
- preserve all citation evidence
- keep aliases on the surviving page when they improve search
- update Wiki Page References and Citations to point at the surviving or split
  pages

Do not delete a page until its cited claims are either migrated or explicitly
discarded as invalid.

CLI support needed:

- duplicate detection with title, alias, body, citation, and neighborhood
  signals
- `page merge` that moves citation markers and Citation edges, migrates aliases,
  rewrites Wiki Page References, creates redirects when supported, and reindexes
  the survivor
- dry-run output showing claims, citations, aliases, and links that will move

## Case: Page Scope Is Wrong

A page may be too broad, too narrow, or using the wrong semantic role.

Expected behavior:

- add or revise `scope_note`
- split claims into separate pages if they represent distinct concepts,
  procedures, requirements, or components
- change frame assignment when the page is misclassified
- keep old citations attached to the claims they actually support

This is graph cleanup, not frame catalog evolution, unless the existing frames
cannot represent the corrected scope.

CLI support needed:

- `page split` or claim-move tooling that preserves citations with the claims
  they support
- frame reassignment with lint explaining why the old and new frames differ
- redirect or alias migration when titles change

## Case: Legacy Manual Link Is Weak Or Vague

Current example: a legacy Manual Link with reason `related` is linted as weak.

Expected behavior:

- remove or ignore generic Manual Links that cannot be justified
- replace Wiki Page-to-Wiki Page navigation with inline Wiki Page References
- prefer Citation edges for evidence support rather than page-to-page
  `related evidence` links when the source evidence is direct
- create a follow-up Domain Relation modeling issue if a semantic edge is
  repeatedly needed

Do not use `related evidence`; direct support belongs in Citation relations and
semantic classification belongs in frame metadata. Future semantic graph edges
belong in governed Domain Relations with typed predicates, evidence, review
status, and lint rules.

CLI support needed:

- legacy Manual Link lint that flags disabled generic edges
- Wiki Page Reference lint that reports missing target pages and citation
  footnote misuse
- cleanup tooling for replacing or removing weak legacy links across a selected
  neighborhood

Deferred until the frame workflow MVP proves a concrete need:

- Domain Relation predicate search showing allowed predicates, definitions,
  examples, non-examples, evidence requirements, review status, and lint rules

## Case: Citation Is Too Broad

Citations point to Source Documents and carry citation-local locator fields.
Any heading, outline path, or source section label should be treated as metadata
on the locator or Source Text Projection, not as a graph target.

Expected behavior:

- add page range when known
- add claim supported by the citation
- add short quote/context when available
- attach Source Text Projection ID and text hash when available
- do not create a separate evidence node by default

Promote evidence into a reusable evidence object only when it has independent
value across multiple pages, claims, or maintenance workflows.

CLI support needed:

- citation lint for missing page range, missing claim, missing quote/context,
  projection mismatch, and over-broad Source Document locators
- citation narrowing that updates locator fields without changing the supported
  claim
- bulk reports sorted by citation risk and retrieval impact

## Case: Citation Is Incorrect Or Stale

Expected behavior:

- verify whether the citation marker still exists in the page body
- verify that the Citation key matches the marker
- verify the Source Document exists
- verify page range is inside the Source Document page count when available
- verify quote/context against the referenced projection when possible
- repair the locator or citation target rather than weakening evidence

If the source no longer supports the claim, remove or rewrite the claim.

CLI support needed:

- citation repair commands that retarget citations, update locator fields, or
  mark a claim unsupported
- page-body/citation reconciliation so marker edits cannot leave dangling
  Citation edges

## Case: Source Extraction Is Wrong

Examples:

- duplicate outline entries or section labels from an old import path
- missing page coverage in projection metadata
- projections attached to a missing Source Document
- Source Text Projection has no embedding
- projection text hash no longer matches the locator

Expected behavior:

- distinguish extraction/index repair from knowledge cleanup
- rebuild projections or embeddings when safe
- avoid creating Wiki Pages from known-bad source structure
- record concrete operation failures when repair is blocked

This should usually be a maintenance task, not part of answer generation.

CLI support needed:

- extraction lint that finds projections without documents, missing page
  coverage, duplicate outline/section metadata, stale projections, and missing
  embeddings
- rebuild commands for projections and embeddings with before/after hashes and
  affected retrieval records

## Case: Records Are Unframed

When frame tools exist, maintenance should identify high-value unframed
records.

Expected behavior:

- frame obvious records using existing frames
- leave uncertain records unframed with a proposal or note
- prioritize framed assignment for cited Wiki Pages, cited source regions, and
  high-rank retrieval results
- avoid bulk-framing all source sections just because the title matches a
  keyword

Frame assignment is a semantic claim and should be auditable.

CLI support needed:

- frame candidate search with examples and non-examples
- bulk frame-assignment dry runs that show confidence, evidence, and affected
  lint rules before mutation
- proposal creation when confidence is low

## Case: Existing Frame Fits Poorly

This is the core decision point for frame catalog evolution.

Convert input to match the existing frame catalog when:

- one existing frame captures the record without distortion
- the issue is missing metadata, weak citation locators, vague links, or missing
  scope notes
- the fix affects only one or two records
- the model already distinguishes the relevant semantic role

Change the frame catalog when:

- several records share a shape that no frame captures
- forcing the records into an existing frame loses important meaning
- the distinction would affect retrieval, learning, citation lint, or page
  promotion behavior
- agents repeatedly produce the same frame proposal
- the user explicitly asks for modeling work

If uncertain, create a frame proposal. Do not silently change the active frame
catalog during unrelated question answering.

CLI support needed:

- frame proposal commands that attach concrete graph examples, non-examples,
  expected slots, metadata semantics, and affected lint behavior

Deferred until the frame workflow MVP proves a concrete need:

- model-impact reports showing which pages, source locator patterns, citations,
  Wiki Page References, future Domain Relations, and retrieval queries would
  change if the proposal is accepted

## Case: Frame Or Domain Relation Vocabulary Needs Tightening

Expected behavior:

- inspect examples and non-examples from the current graph
- define the semantic boundary
- define expected metadata slots and any governed Domain Relation predicates
- define lint rules and severities
- rebuild or reclassify current proof-of-concept instances when needed
- keep future durable frame changes reviewed when behavior changes

Frame catalog changes should be reviewed like architecture decisions, not
treated as incidental metadata edits.

CLI support needed:

- frame and Domain Relation lint that can run against both the current catalog
  and a proposed catalog

Deferred until the frame workflow MVP proves a concrete need:

- frame catalog versioning and accepted/rejected proposal history
- migration tooling that reclassifies durable instances, rewrites governed
  predicates, and records the old semantics for audit

For the current proof-of-concept graph, incompatible frame changes may rebuild
graph records from Source Documents instead of migrating existing local data.

## Outputs

A successful maintenance pass may produce:

- merged or split Wiki Pages
- repaired Citation locators
- removed legacy Manual Links or corrected Wiki Page References
- rebuilt projections or embeddings
- frame assignments or frame proposals
- Domain Frame revisions
- follow-up issues for blocked repairs

It should not produce:

- silent deletion of cited claims
- unsupported relationship labels
- bulk frame assignments without review
- frame catalog changes with no concrete graph examples
