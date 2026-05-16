# Architecture Quality

Architecture quality means matching code complexity to problem complexity.

Good architecture exposes what callers must control and hides what they should
not need to know. It is valuable when it reduces cognitive load, change
amplification, information leakage, or misplaced responsibility.

## Vocabulary

- **Abstraction**: a simplified thing callers use, such as a package entrypoint,
  CLI command, repository interface, query helper, route, or UI helper.
- **Interface**: everything callers must know to use an abstraction.
- **Implementation**: the code and runtime behavior hidden behind an interface.
- **Information hiding**: keeping unnecessary implementation decisions out of
  caller code.
- **Abstraction barrier**: the line between an interface and implementation.
- **Coupling**: how much one area must know about or change with another.
- **Cohesion**: how strongly the responsibilities inside an area belong
  together.
- **Essential complexity**: complexity inherent to the product, domain, runtime,
  graph model, or integration problem.
- **Accidental complexity**: complexity from structure, naming, stale contracts,
  misplaced ownership, compatibility paths, or tooling.
- **Change amplification**: one conceptual change requiring edits in many
  places.
- **Cognitive load**: how much a human or agent must understand to make a safe
  change.
- **Information leakage**: implementation details leaking through an interface.
- **Abstraction leverage**: caller complexity removed relative to interface
  complexity.

Use concrete Originium nouns: app, package, Source Document, Source Heading,
Wiki Page, Citation, Change Log, CLI command, SurrealDB query, file bucket,
schema, route, or UI view. Avoid generic `module` when an owning concept is
available.

Use **boundary** for runtime, process, database, credential, or trust
separation. Use **contract** for durable domain or data contracts, not every
interface.

## Good Code

Good Originium code:

- has interfaces smaller than the implementation knowledge they hide;
- puts behavior under the owner whose concept it serves;
- keeps related responsibilities cohesive;
- avoids compatibility paths that preserve old concepts after refactors;
- makes behavior testable through the real interface;
- reports concrete failures with relevant inputs and actionable reasons;
- removes accidental complexity instead of moving it between files.

Large code is not automatically bad. Small code is not automatically good. A
small wrapper is accidental complexity if it hides nothing and adds another
name.

## Audit Heuristics

Look for:

- **Shallow abstraction**: the interface is nearly as complex as the
  implementation.
- **Pass-through abstraction**: a layer mostly forwards work and hides no
  meaningful decision.
- **Leaky abstraction**: callers must know hidden ordering, storage, provider,
  runtime, or error details.
- **Low cohesion**: unrelated responsibilities change for unrelated reasons in
  the same area.
- **High coupling**: a change to one concept forces changes in many owners.
- **Change amplification**: agents repeatedly touch several files for one
  conceptual change.
- **Speculative abstraction**: indirection for imagined variation rather than
  real adapters.
- **Misplaced responsibility**: behavior lives under the wrong owner.
- **Legacy drag**: old names, compatibility paths, or migration leftovers shape
  current code.
- **Weak test interface**: tests mock internals because the public interface is
  not expressive or stable enough.

## Value Test

Architecture work is worth doing when the value is concrete. Justify candidates
with:

- what callers no longer need to know;
- what code, names, states, branches, tests, or docs can disappear;
- which changes become localized;
- which behavior becomes easier to test through a real interface;
- which future task becomes simpler;
- which user-visible or operational behavior becomes more reliable.

Do not justify architecture work with taste, pattern completion, symmetry,
local tidiness, or speculative future flexibility.

## Deletion Test

When evaluating an abstraction, imagine deleting it. If deletion removes
complexity without moving it elsewhere, the abstraction was probably
pass-through structure. If deletion makes callers recreate the same policy,
ordering, validation, or integration knowledge, it is earning its keep.
