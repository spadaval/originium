# Implications For Originium

This document turns the landscape review into design guidance for Originium's
CLI, retrieval graph, and learning graph capability.

## Architectural Direction

Originium should keep one canonical source-backed Domain Graph and add derived
overlays for retrieval, learning, indexes, projections, and proposals.

Recommended layers:

- **Domain Graph**: Source Documents, Wiki Pages, Domain Frames, reviewed
  relationships, Citations, source evidence, role classification, and graph
  evolution records.
- **Retrieval Projections**: full-text indexes, embeddings, source text
  projections, synthesized context bundles, graph neighborhoods, centrality,
  freshness, and ranking features.
- **Learner Graph**: append-only learner observations, assessment responses,
  misconceptions, session history, per-learner skill/concept projections, and
  scheduling state.
- **Alignment Layer**: links from learner observations and learning items back
  to Domain Graph nodes, Citation locators, examples, misconceptions, and graph
  versions.
- **Proposal Layer**: generated or inferred concepts, edges, summaries, and
  learning items awaiting review or lint acceptance.

The Domain Graph remains canonical for answering questions. Learning planning
may read Domain Graph structure, but it should never become an answer source.

## Query Policy Split

The same graph can serve answering and learning if the CLI exposes distinct
query patterns.

Answer retrieval should be global and evidence-first:

- Search Source Documents, citation locators, Wiki Pages, concepts, and
  projections.
- Rank by relevance, citation coverage, source authority, freshness,
  contradiction handling, and graph importance.
- Use concept/prerequisite structure as supporting context, not as truth.
- Always surface citations and the concrete graph/query operation used.

Learning planning should be local and ordered:

- Start from a learner, target topic, current frontier, or recent observation.
- Filter by teachable role, prerequisite readiness, learner state, and
  intervention value.
- Retrieve nearby examples, references, citation locators, and misconceptions.
- Emit a learning item or session plan with explicit assessed concepts.
- Record the resulting response as an observation, then update derived learner
  projections.

This is a productive tension. Answer retrieval pressures the graph to stay
cited, global, and source-backed. Learning pressures it to become granular,
ordered, role-aware, and inspectable.

## Relationship Model

The current learning graph spec should keep its proposed relationship families,
but the landscape suggests a stronger operational split.

Domain relationships:

- `concept_depends_on`
- `concept_builds_toward`
- `concept_part_of`
- `concept_contrasts_with`
- `concept_applies_to`
- `concept_exemplified_by`
- `concept_supported_by`
- `concept_refines`
- `concept_merged_into`
- `concept_split_into`
- `concept_demoted_to_reference`
- `concept_promoted_to_concept`

Learning relationships:

- `learner_observed`
- `learner_aligns_to`
- `learner_conflicts_with`
- `response_assesses`
- `intervention_targets`
- `item_teaches`
- `item_reviews`
- `item_remediates`

Operational relationships:

- `proposal_suggests`
- `proposal_replaces`
- `projection_derived_from`
- `index_covers`
- `query_used`

Every semantic edge that can affect retrieval or learning should carry:

- Source Document or Citation locator
- evidence text or evidence reference
- confidence
- review status
- creator
- created session
- graph version
- model or extraction pipeline version when generated

## Reference Material

The landscape strongly supports the spec's distinction between learnable
concepts and reference/support material.

Originium should not try to teach every source outline entry, Wiki Page, entity,
or reference record. Instead, classify graph nodes by role:

- `concept`
- `skill`
- `procedure`
- `example`
- `case_study`
- `reference`
- `evidence`
- `assessment`
- `misconception`

Then classify teachability separately:

- `core`
- `prerequisite`
- `extension`
- `enrichment`
- `reference_only`
- `not_teachable`

Reference material still matters for learning. It can provide examples,
interactive exploration, exercises, source-grounded hints, contrast cases, and
retrieval context. It should not receive mastery state unless it is promoted to
a concept, skill, procedure, or assessment target.

## Graph Evolution

Continuous graph refinement is compatible with learning if past events record
the graph state they were interpreted against.

Store learner observations as append-only events with:

- learner ID
- response/session ID
- learning item ID
- assessed concept or skill IDs
- Source Document IDs or Citation locator IDs used in the prompt or expected
  answer
- correctness or rubric outcome
- confidence, latency, hints, and interaction metadata where available
- Domain Graph version
- assessment model version

Store current learner mastery and scheduling as projections. When a concept is
split, merged, demoted, promoted, or re-scoped, do not rewrite old observations
as if they happened under the new graph. Add migration/alignment records and
recompute current projections lazily.

## CLI Implications

The CLI should expose graph state and pipeline state with precise operations
and concrete errors. Borrow the operational shape from Tesseract, Basic Memory,
Engram, Kompl, and OmegaWiki.

Useful future commands:

```bash
originium graph doctor
originium graph lint --semantic
originium graph links <node-id>
originium graph backlinks <node-id>
originium graph orphans
originium graph proposals

originium concept extract --source <source-id>
originium concept classify <concept-id>
originium concept link --from <concept-id> --to <concept-id> --label depends_on
originium concept review <edge-id> --accept

originium retrieve answer-context --query "..." --explain
originium retrieve neighborhood <node-id> --depth 2 --mode evidence

originium learner observe --learner <learner-id> --item <item-id>
originium learner state --learner <learner-id> --concept <concept-id>

originium learn next --learner <learner-id> --topic <concept-id> --explain
originium learn path --from <concept-id> --to <concept-id>
originium learn record-response --session <session-id>
```

The important CLI behavior is not the exact command names. It is that users can
inspect what the system extracted, what it inferred, what it reviewed, what it
used for retrieval, and why a learning item was selected.

## What To Borrow

Borrow these patterns:

- Kompl's staged compile pipeline and persistent synthesized context.
- OmegaWiki's schema contracts, edge linting, and evidence/confidence fields.
- Atomic's durable background jobs and proposal-before-accept synthesis.
- Logseq's stable IDs and mirror/export clarity.
- Trilium's multi-parent branch model and queryable typed relations.
- Tesseract's agent-friendly JSON indexer and `doctor`/`orphans`/`backlinks`
  operational commands.
- OATutor's Q-matrix-like mapping from items/responses to skills.
- Anki's immutable review log and derived scheduling state.
- pyBKT's strict ordered-response data contract.
- Basic Memory and Engram's rebuildable index discipline.
- Textrawl's structured tool responses and explicit embedding configuration.
- ORKG's contribution-like subnodes for source documents with multiple claims.
- SHACL/PROV-style validation and provenance concepts where they fit.

## What Not To Do

Avoid these approaches:

- Do not store learner mastery on Domain Graph nodes.
- Do not treat generated prerequisite edges as true because they sound
  pedagogically plausible.
- Do not let link prediction, embedding similarity, or graph centrality become
  evidence.
- Do not make embeddings required for all retrieval paths.
- Do not hide stale indexes, failed background jobs, provider changes, or
  truncation.
- Do not claim Markdown is source of truth if it is only an export or
  projection.
- Do not make RDF/SPARQL the only early user interface.
- Do not let relation vocabularies grow without review.
- Do not collapse item difficulty, concept mastery, scheduling priority, and
  source importance into one score.
- Do not rely on mutable current mastery without keeping event history.

## Near-Term Product Bet

The next useful milestone should prove that Originium can:

1. Extract concept-like Domain Graph nodes from a curated source.
2. Classify nodes by graph role and teachable role.
3. Add prerequisite/support edges with Source Document or Citation locator
   provenance, confidence, and review status.
4. Use concept structure as an optional retrieval signal without losing
   citation-backed answer context.
5. Record learner observations aligned to concepts without mutating the Domain
   Graph.
6. Select a local next learning target from prerequisite readiness and learner
   state.

That is enough to validate the dual-use graph design without committing to a
full tutor UI or a complex adaptive-learning model too early.
