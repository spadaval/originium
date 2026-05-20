# Answer A Question

This access pattern covers an agent answering a user question from maintained
Graph Wiki knowledge. The answer should use Wiki Pages first, then cited source
evidence, then source search when the maintained graph is incomplete.

The key decision is whether the answer can be produced from existing graph
state, or whether the agent should create/update Wiki Pages before answering.

## Default Flow

1. Start a session.
2. Search Wiki Pages and graph retrieval for the question.
3. Read the strongest Wiki Page candidates.
4. Validate citations for any page used.
5. If no adequate Wiki Page exists, search Source Headings and Source Text
   Projections.
6. Decide whether to answer directly from source evidence or create/update a
   Wiki Page first.
7. If new durable knowledge is created, cite it precisely and run lint.
8. Answer with the graph's confidence and gaps made visible.

## Case: Existing Page Answers The Question

Expected behavior:

- read the page
- validate citation markers against Citation edges
- inspect neighborhood if relationships affect the answer
- answer from the page and cited evidence
- avoid unnecessary graph mutation

If the question asks for a short factual answer, a page read plus citation
validation is enough.

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

## Case: No Wiki Page Exists But Source Evidence Exists

Expected behavior:

- identify the relevant Source Heading and page range
- decide whether the topic is important enough for durable synthesis
- if yes, create a Wiki Page before answering
- if no, answer from source evidence and say the graph has source material but
  no maintained page yet

The threshold for creating a page should be lower when:

- the user is likely to ask about the topic again
- the topic connects multiple sources
- the answer introduces a new concept, requirement, procedure, or architecture
- the answer will need multiple citations

## Case: Source Document Is Missing

Expected behavior:

- do not answer as if the source is in the curated graph
- explain that the graph does not contain the required source
- ask for or import the source if the user wants it added
- if using general knowledge would be useful, clearly separate it from graph
  evidence

The Graph Wiki answer path should not silently fall back to uncited model
knowledge.

## Case: Source Exists But Evidence Search Is Inconclusive

Expected behavior:

- report the search operations and inputs
- name the closest Source Headings or Wiki Pages found
- explain why they do not answer the question
- avoid creating speculative pages

This is a retrieval gap, not a reason to invent graph structure.

## Case: Existing Graph Knowledge Appears Incorrect

Expected behavior:

- preserve the old evidence
- cite the correcting source
- update or annotate the Wiki Page with the correction
- create a maintenance note or issue if the correction implies merges, splits,
  or stale links

If the page body and citations disagree, answer from the cited source evidence
and flag the page as stale.

## Case: Evidence Conflicts Across Sources

Expected behavior:

- show both sides with their citations
- describe source scope and date if available
- avoid picking a winner unless the graph has review/supersession metadata
- create a maintenance task if this should become durable contradiction state

The answer should make conflict visible.

## Case: The Question Is Procedural

Examples:

- "How do I configure a FAN REP ring?"
- "How do I apply a CURWB configuration template?"

Expected behavior:

- search for procedure-like headings and pages
- cite the procedure source heading with page-local locator fields
- preserve ordered steps
- distinguish prerequisites, steps, validation, and warnings when possible
- do not convert the procedure into a concept unless there is a separate concept
  worth teaching or retrieving

## Case: The Question Asks For Learning Guidance

Expected behavior:

- answer from source-backed concepts and frames
- distinguish teachable concepts from reference material
- do not mutate learner state unless the command is explicitly a learning
  workflow
- if a learning path requires missing prerequisites, create proposals or
  maintenance notes rather than asserting unsupported prerequisite edges

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
