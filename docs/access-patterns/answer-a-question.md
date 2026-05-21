# Answer A Question

This access pattern covers an agent answering a user question from maintained
Graph Wiki knowledge. The answer should use Wiki Pages first, then cited Source
Document evidence, then source search when the maintained graph is incomplete.

The key decision is whether the answer can be produced from existing graph
state, or whether the agent should create/update Wiki Pages before answering.

## Agent And CLI Split

The agent decides what would answer the user's question and whether the graph is
complete enough to answer responsibly. The CLI should provide retrieval,
evidence inspection, citation validation, and safe write paths when the answer
reveals reusable missing knowledge.

Agent judgment:

- interpret the user's question and decide what kind of answer is being asked
  for
- decide whether existing Wiki Pages are sufficient, stale, too thin, or
  conflicting
- decide when to answer directly from source evidence versus creating or
  updating a Wiki Page first
- write the final answer with visible confidence, gaps, and source scope
- avoid mutating learner state or the Domain Model unless the command is
  explicitly a learning or modeling workflow

CLI responsibility:

- run page, source, citation, frame, and graph-neighborhood retrieval with
  transparent inputs
- validate citations for every Wiki Page used in the answer
- expose stale, missing, broad, or mismatched citations before the answer is
  trusted
- create or patch pages through citation-aware commands when durable knowledge
  is missing
- run lint and reindexing after any page or citation mutation

The CLI should make the cheap path easy: read page, validate citations, inspect
neighborhood, answer. It should also make the responsible mutation path
repeatable when the graph is incomplete.

## Default Flow

1. Start a session.
2. CLI searches Wiki Pages, graph retrieval, frames, and neighborhoods for the
   question.
3. CLI reads the strongest Wiki Page candidates and citation sets.
4. CLI validates citations for any page used.
5. Agent decides whether the existing graph answers the question.
6. If no adequate Wiki Page exists, CLI searches Source Documents and Source
   Text Projections.
7. Agent decides whether to answer directly from source evidence or
   create/update a Wiki Page first.
8. If new durable knowledge is created, CLI creates precise citations, runs
   lint, and reindexes changed records.
9. Agent answers with the graph's confidence and gaps made visible.

## Case: Existing Page Answers The Question

Expected behavior:

- read the page
- validate citation markers against Citation edges
- inspect neighborhood if relationships affect the answer
- answer from the page and cited evidence
- avoid unnecessary graph mutation

If the question asks for a short factual answer, a page read plus citation
validation is enough.

CLI support needed:

- an answer-read bundle that returns page body, citation validation status,
  Source Document locators, and graph neighborhood in one inspectable result
- citation severity levels so the agent can decide whether a warning blocks the
  answer

## Case: Existing Page Exists But Is Too Thin

Current example: `wiki_page:autonomous_operations` is a short concept page with
one citation. It may answer a smoke-test question, but it is not enough for a
deep explanation.

Expected behavior:

- read the page
- search nearby source evidence
- patch the page only when the answer reveals reusable knowledge
- add citations for new claims
- keep the answer clear about what was newly compiled

Do not create a second page for the same topic just because the current page is
small.

CLI support needed:

- evidence expansion search seeded by an existing Wiki Page
- page patch tooling that can add a cited claim without invalidating existing
  markers
- post-patch lint and retrieval reindexing

## Case: No Wiki Page Exists But Source Evidence Exists

Expected behavior:

- identify the relevant Source Document, page range, and projection span
- decide whether the topic is important enough for durable synthesis
- if yes, create a Wiki Page before answering
- if no, answer from source evidence and say the graph has source material but
  no maintained page yet

The threshold for creating a page should be lower when:

- the user is likely to ask about the topic again
- the topic connects multiple sources
- the answer introduces a new concept, requirement, procedure, or architecture
- the answer will need multiple citations

CLI support needed:

- source-to-page promotion that starts from selected Source Documents,
  projection snippets, or page locators
- citation-aware page creation that fails if the cited source locator cannot be
  validated

## Case: Source Document Is Missing

Expected behavior:

- do not answer as if the source is in the curated graph
- explain that the graph does not contain the required source
- ask for or import the source if the user wants it added
- if using general knowledge would be useful, clearly separate it from graph
  evidence

The Graph Wiki answer path should not silently fall back to uncited model
knowledge.

CLI support needed:

- corpus/source search that clearly distinguishes missing Source Documents,
  imported but unindexed Source Documents, and indexed sources with no matching
  evidence

## Case: Source Exists But Evidence Search Is Inconclusive

Expected behavior:

- report the search operations and inputs
- name the closest Source Documents, projection spans, or Wiki Pages found
- explain why they do not answer the question
- avoid creating speculative pages

This is a retrieval gap, not a reason to invent graph structure.

CLI support needed:

- search trace output that records queries, filters, candidate scores, and
  rejected near misses
- a follow-up issue or proposal command for missing retrieval coverage

## Case: Existing Graph Knowledge Appears Incorrect

Expected behavior:

- preserve the old evidence
- cite the correcting source
- update or annotate the Wiki Page with the correction
- create a maintenance note or issue if the correction implies merges, splits,
  or stale links

If the page body and citations disagree, answer from the cited source evidence
and flag the page as stale.

CLI support needed:

- stale-page lint comparing page claims, citation claims, and citation targets
- page patch or correction tooling that preserves old evidence in the change log

## Case: Evidence Conflicts Across Sources

Expected behavior:

- show both sides with their citations
- describe source scope and date if available
- avoid picking a winner unless the graph has review/supersession metadata
- create a maintenance task if this should become durable contradiction state

The answer should make conflict visible.

CLI support needed:

- conflict notes or contradiction records linked to the affected claims and
  citations
- retrieval display that groups evidence by source scope, date, and confidence

## Case: The Question Is Procedural

Examples:

- "How do I configure a FAN REP ring?"
- "How do I apply a CURWB configuration template?"

Expected behavior:

- search for procedure-like source sections, projection spans, and pages
- cite the Source Document with page-local locator fields
- preserve ordered steps
- distinguish prerequisites, steps, validation, and warnings when possible
- do not convert the procedure into a concept unless there is a separate concept
  worth teaching or retrieving

CLI support needed:

- procedure-aware retrieval that preserves step order and warning context
- citation tooling that can attach locators to individual steps instead of only
  the whole procedure source range

## Case: The Question Asks For Learning Guidance

Expected behavior:

- answer from source-backed concepts and frames
- distinguish teachable concepts from reference material
- do not mutate learner state unless the command is explicitly a learning
  workflow
- if a learning path requires missing prerequisites, create proposals or
  maintenance notes rather than asserting unsupported prerequisite edges

CLI support needed:

- learning-read commands that inspect teachable concept structure separately
  from answer retrieval
- proposal commands for prerequisite or sequencing edges that are not yet
  source-supported

## Outputs

A successful question-answering pass may produce:

- an answer grounded in existing Wiki Pages
- new or updated Wiki Pages when reusable knowledge is missing
- new precise Citations
- maintenance issues for stale pages, conflicts, duplicates, or missing sources

It should not produce:

- unsupported semantic edges
- uncited source-backed claims
- new Domain Model frames during ordinary answer generation unless the user
  explicitly asks for modeling work
