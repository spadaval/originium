# Governed Domain Relations

Originium should reintroduce semantic graph edges only as governed Domain
Relations, and only after repeated Graph Wiki workflows need typed,
queryable relationships that cannot be represented by Citations, inline Wiki
Page References, Domain Frames, or frame metadata.

Until that threshold is met, semantic graph edges remain deferred. The current
implementation should keep focusing on Source Document Citation locators, Wiki
Page References, answer context, lint, and safe refactors.

## Decision

Domain Relations are the only accepted path for future semantic graph edges.
They are not generic Manual Links and they are not evidence citations.

If implemented, each Domain Relation must include:

- a typed predicate from a small governed catalog
- subject and object record scopes, such as Wiki Page to Wiki Page or Wiki Page
  to Source Document
- reason or claim text that states what the edge asserts
- source evidence or Citation locator support
- confidence and review status
- examples and non-examples for the predicate
- lint rules for predicate validity, endpoint scope, evidence presence, review
  state, stale evidence, and contradictory relations
- CLI workflows to propose, inspect, validate, review, deprecate, and remove
  relations

The first predicate catalog should be small. Candidate predicates include
`depends_on`, `part_of`, `implements`, `constrains`, `supersedes`, and
`contrasts_with`, but each predicate needs accepted examples and non-examples
before it becomes writable graph state.

## Rationale

Originium needs stronger graph semantics than a plain page-link graph, but
ungoverned edges create misleading authority. A relation such as `depends_on`
or `supersedes` changes retrieval, maintenance, and answer context behavior; it
needs evidence, review, and lintable endpoint rules.

Current Manual Links are insufficient because they are broad ad hoc edges.
Labels such as `related`, `related evidence`, `uses`, or `depends on` do not
state endpoint scope, evidence requirements, review status, confidence, or
predicate-specific meaning. They are too loose to support retrieval authority
or graph maintenance without becoming a junk drawer.

Citations already own claim-to-Source Document evidence. Wiki Page References
already own page-to-page navigation in Page Body prose. Domain Frames and frame
metadata already own classification. Domain Relations should exist only for
semantic relationships that need their own queryable lifecycle.

## Alternatives Considered

Keep generic Manual Links and document better labels. This is rejected because
the graph would still accept vague or incompatible predicates without evidence,
review state, or lintable endpoint rules.

Use inline Wiki Page References for all page-to-page relationships. This is
accepted for reading and navigation, but rejected for semantic graph edges
because inline prose links do not carry typed predicates, review state,
confidence, or relation-specific evidence.

Use Citations for semantic relations. This is rejected because Citations target
Source Documents only. Turning page-to-page semantics into Citations would blur
evidence support with graph navigation and violate the citation model.

Model every possible semantic edge now. This is rejected because the current
proof of concept has not proven which predicates are repeatedly useful.
Premature relation catalogs would harden weak ontology decisions.

## Examples

Accepted future examples:

- `wiki_page:curwb_backhaul` `implements` `wiki_page:autonomous_mining_network`
  when cited source evidence explains that the backhaul architecture realizes
  the autonomous mining network capability.
- `wiki_page:curwb_reference_architecture` `supersedes`
  `wiki_page:legacy_wireless_design` when cited source evidence and
  review status justify the version relationship.
- `wiki_page:qos_requirements` `constrains`
  `wiki_page:wireless_backhaul_configuration` when source evidence states that
  QoS requirements limit configuration choices.

Non-examples:

- `wiki_page:a` `related` `wiki_page:b`
- `wiki_page:a` `related_evidence` `source_document:x`
- an inferred similarity edge with no reason text or evidence
- a page-to-page reading link that can remain `[[Page Title]]` in prose
- a Citation-like edge that points to a Wiki Page instead of a Source Document

## Deferred Relation Types

These relation families stay deferred until concrete workflows justify them:

- lifecycle-only relations such as redirects, aliases, duplicates, and merges
- ownership or authorship relations
- fine-grained claim-level fact graph relations
- procedure-step or ordered-step relations
- contradiction records or contradiction edges
- similarity, recommendation, or embedding-derived relations
- arbitrary `related` or `see also` relations

Implementation becomes justified when agents repeatedly need graph queries,
lint, or maintenance workflows that inline Wiki Page References and cited prose
cannot satisfy. Examples include retrieval ranking that needs reviewed
`supersedes` edges, maintenance reports that need valid `depends_on` impact
traversal, or answer context that needs reviewed `constrains` edges with
source-backed reasons.
