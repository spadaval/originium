# Learning Graph Capability Specification

## Purpose

Originium's primary goal remains answering questions from high-quality curated
sources. The learning graph capability extends that goal by modeling how source
material can be learned, practiced, and reconciled with a learner's observed
understanding.

The capability should improve Graph Wiki retrieval rather than fork it. The
canonical Domain Graph remains source-backed. Learning-specific state is a
separate projection over that graph, used for planning lessons, quizzes, review,
and interactive learning sessions.

## Core Thesis

Question answering and learning are not adversarial at the graph-truth level.
Both need granular, cited, well-scoped concepts and explicit relationships. The
tension is in query policy:

- Answer retrieval is global, relevance-seeking, and authority-weighted.
- Learning planning is local, ordered, learner-stateful, and readiness-weighted.

The same Domain Graph can serve both if the graph keeps evidence canonical and
the CLI exposes distinct query patterns for answer retrieval and learning.

## Graph Layers

### Domain Graph

The Domain Graph is the objective-ish, source-backed map of the material.

It contains:

- Source Documents and Source Text Projections.
- Wiki Pages and concept-like synthesis records.
- Citations and evidence provenance.
- Concept structure, including prerequisite, hierarchy, contrast, application,
  and example relationships.
- Review status and confidence for extracted or agent-created structure.

The Domain Graph may evolve continuously as agents query, refine, split, merge,
and clean up graph state. It is the canonical graph for answering questions.

### Learner Graph

The Learner Graph is subjective and per learner. It should not be stored as
mastery fields on Domain Graph records.

It contains:

- Learner observations.
- Learner concept or skill state.
- Learner misconceptions.
- Assessment responses.
- Session history.
- Review scheduling state.
- Alignment and conflict links back to Domain Graph nodes.

The Learner Graph can represent partial, messy, or incorrect understanding.
Its job is not to mirror the Domain Graph; its job is to record the learner's
observed mental model well enough to plan useful interventions.

### Alignment Layer

The Alignment Layer reconciles Learner Graph state with Domain Graph state.

It answers:

- Which learner observations align to which concepts or skills?
- Which learner beliefs conflict with source-backed structure?
- Which missing prerequisite blocks the next concept?
- Which evidence or example should be used to repair the mismatch?
- How should learner state be interpreted after a Domain Graph concept is
  split, merged, demoted, promoted, or re-scoped?

## Domain Relationships

The learning capability should add stricter relationships than generic Manual
Links. Manual Links remain useful for wiki navigation, but learning and retrieval
need validated semantic edges.

Minimum useful Domain Graph relationships:

- `concept_depends_on`: concept A requires concept B for understanding.
- `concept_builds_toward`: concept B prepares the learner for concept A, but is
  not a strict prerequisite.
- `concept_part_of`: concept A is a sub-concept of concept B.
- `concept_contrasts_with`: concepts are meaningfully distinguished or commonly
  confused.
- `concept_applies_to`: a concept applies to a domain, case, workflow, or
  system.
- `concept_exemplified_by`: an example, case, source section, or problem makes
  a concept concrete.
- `concept_supported_by`: a concept or concept edge is supported by a Citation
  to a Source Document with citation-local locator metadata.

Useful edge fields:

- `reason`
- `confidence`
- `review_status`
- `created_session`
- `citation_locator`
- `strength`

Prerequisite-like edges should never be treated as true merely because they are
pedagogically plausible. They need provenance, confidence, and graph linting.

## Node Roles

Not all graph material should be taught directly. The graph should distinguish
learnable concepts from reference or support material.

Recommended role axes:

- `graph_role`: `concept`, `reference`, `example`, `procedure`, `evidence`,
  `case_study`, `assessment`, `misconception`, `skill`
- `teachable_role`: `core`, `prerequisite`, `extension`, `enrichment`,
  `reference_only`, `not_teachable`

Learning should model mastery only over learnable concepts and skills. Reference
material can still be used as context, examples, assessment substrate, or
interactive session material.

## Learner Relationships

Minimum useful Learner Graph relationships:

- `learner_observed`: a session or response produced an observation.
- `learner_aligns_to`: a learner node aligns with a Domain Graph concept,
  skill, example, or misconception.
- `learner_conflicts_with`: a learner belief or misconception conflicts with a
  source-backed Domain Graph node.
- `response_assesses`: an assessment item or learner response assesses a
  concept or skill.
- `intervention_targets`: a lesson, quiz, or explanation targets a learner
  mismatch.

Learner state should be derived from append-only observations where practical,
not stored only as mutable mastery scores.

## Graph Evolution

The Domain Graph is expected to improve over time. Learning state must survive
that evolution.

Semantic graph evolution should be explicit:

- `concept_merged_into`
- `concept_split_into`
- `concept_supersedes`
- `concept_scope_changed`
- `concept_demoted_to_reference`
- `concept_promoted_to_concept`

Learner observations should record the Domain Graph version or semantic concept
state they were assessed against. Current learner mastery can be recalculated or
migrated lazily when graph structure changes.

Rule: graph refinement should improve future teaching without falsifying past
learning history.

## Query Patterns

### Answer Retrieval

Answer retrieval should remain global and evidence-first.

It should:

- Search across Wiki Pages, concepts, Source Documents, citation locators, and
  projections.
- Rank by relevance, citation coverage, source authority, graph centrality,
  importance, and contradiction handling.
- Use prerequisite or concept structure only as supporting context.
- Never answer from a learning plan instead of source-backed evidence.

### Learning Planning

Learning planning should be local, ordered, and learner-stateful.

It should:

- Start from a learner frontier or target topic.
- Filter by prerequisite readiness and teachable role.
- Prefer concepts with appropriate difficulty and high learning value.
- Retrieve nearby examples, reference material, misconceptions, and source
  evidence to build an intervention.
- Update Learner Graph observations after the session.

## CLI Direction

The CLI should preserve lower-level graph primitives while adding workflow
commands for learning use cases.

Possible future commands:

```bash
originium concept extract --source <source-id>
originium concept link --from <concept-id> --to <concept-id> --label depends_on
originium concept lint

originium learner create --name <name>
originium learner observe --learner <learner-id> --response <response-id>
originium learner state --learner <learner-id> --concept <concept-id>

originium learn next --learner <learner-id> --topic <concept-id>
originium learn path --from <concept-id> --to <concept-id>
originium learn record-response --session <learning-session-id>
```

Initial work should favor inspectable JSON and concrete technical errors,
consistent with the existing CLI contract.

## Non-Goals

- Do not replace Graph Wiki retrieval with lesson planning.
- Do not store learner mastery directly on Domain Graph nodes.
- Do not treat every source section, Wiki Page, or reference record as a
  teachable concept.
- Do not allow unsupported prerequisite edges to influence answer truth.
- Do not require the web UI to be redesigned before CLI learning workflows can
  be prototyped.

## Acceptance Direction

A first useful milestone should prove:

1. A curated source can produce or update concept-like Domain Graph nodes.
2. Concept nodes can be classified by graph role and teachable role.
3. At least one prerequisite edge and one support/evidence edge can be recorded
   with provenance and confidence.
4. Answer retrieval can use the concept graph as an optional ranking/context
   signal without losing citation-backed evidence.
5. A learner can have observations aligned to concepts without mutating the
   Domain Graph.
6. A `learn next`-style workflow can choose a local next concept from learner
   state and prerequisite readiness.
