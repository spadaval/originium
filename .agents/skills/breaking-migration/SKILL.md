---
name: breaking-migration
description: Use for massive breaking changes, demolition beads, reconnect work, and closeout beads where we intentionally permit temporary downstream breakage.
---

# Breaking Migration

Our normal procedure is to keep the codebase in a good state after each change.
This is the exception. Originium allows temporary broken states during planned
migrations, but only when the breakage is named, scoped, and handed off clearly.

Use `docs/agent/beads.md` for tracker mechanics and
`docs/architecture/quality/validation.md` for validation command ownership.

## First Classify The Bead

Read the bead, parent epic, and nearby siblings before editing:

```bash
git status --short --branch
bd show <id>
bd list --status=open
bd search "<legacy-or-target-term>"
```

Read current ADRs or ownership docs only when the target state, dependency
direction, or migration phase is unclear from the bead and parent epic.

Classify the work as one of:

- `demolition`: remove a legacy interface and intentionally break callers.
- `reconnect`: reconnect one owned slice to the target design after demolition.
- `closeout`: validate and clean up an integrated epic or phase.
- `ambiguous`: stop and resolve the tracker/docs before editing.

Do not guess. If the bead does not clearly say which class it is, inspect the
parent epic, current ADRs, and sibling beads. If still unclear, update the
tracker or ask for a decision.

## Demolition Rules

For demolition beads:

- Delete the named legacy interface in place.
- Remove replaced names, paths, interfaces, schema, package exports, and tests
  that only exist to keep the legacy interface alive.
- Do not reconnect unrelated downstream callers unless the bead explicitly says
  to.
- Do not add compatibility aliases, deprecated wrappers, compatibility
  symlinks, transitional adapters, dual imports, old-path re-exports, or
  renamed wrappers.
- Do not write performative tests that only prove deleted code is still gone.
- Do record expected downstream breakage and the reconnect/closeout bead that
  owns it in the bead notes or `Acceptance Criteria`.

Good demolition validation is narrow:

- the legacy interface is unavailable;
- the owned package or schema deletion is coherent;
- any focused tests that still describe surviving behavior pass, if such tests
  exist.

Repo-wide compile or `bun run check` may fail after a valid demolition. If it
does, capture the exact failure and owning reconnect bead instead of hiding it.

## Reconnect Rules

For reconnect beads:

- Reconnect the named owned slice to the target design.
- Update docs and tests for the reconnected seam.
- Use the new target contracts directly.
- Remove nearby legacy references in the owned slice rather than preserving
  compatibility paths.
- Keep the reconnect focused. File follow-up beads for adjacent breakage outside
  the owned slice.

Focused validation should prove the reconnected seam and satisfy the bead's
`Acceptance Criteria`, not the entire migration, unless the bead says it is a
closeout point.

## Closeout Rules

For `closeout` beads:

- Inspect the parent epic and all open/closed child beads.
- Identify all intentional temporary breakage recorded by demolition and reconnect
  beads.
- Confirm target docs and ADRs describe the implemented state. Fix docs if the
  implemented target has legitimately changed.
- Run broad command validation and validation appropriate to the epic.
- Prove or classify every parent epic validation criterion as passed, failed,
  blocked, deferred, or not applicable.
- Clean up migration debris: stale imports, deleted terminology in current docs,
  dead tests, obsolete notes, unused exports, package manifest drift, and
  temporary exceptions.
- File beads for any real remaining work outside the closeout bead's
  reasonable cleanup scope.

Choose the broadest set needed to prove that epic's target state. If a check is
not run because of environment limits, state the concrete reason.

## Failure Classification

When a command fails, classify it:

- expected downstream breakage from a demolition bead;
- in-scope blocker for the current reconnect or closeout bead;
- environment/tooling failure;
- unrelated pre-existing failure;
- newly discovered bug requiring a follow-up bead.

Useful failure notes include:

- command
- package/file area
- first concrete error
- whether it is expected
- bead that owns the fix

Do not paste raw huge logs into beads. Summarize enough for a future agent to
reproduce and understand the failure.

## Handoff

For demolition handoff, include:

- deleted legacy interfaces
- validation run
- known broken callers or commands
- reconnect or closeout bead IDs expected to reconnect them

For closeout handoff, include:

- child beads inspected
- docs/ADRs updated or confirmed
- broad checks run
- validation scenarios and result states
- remaining failures, if any
- follow-up bead IDs

Always push beads state before handoff:

```bash
bd dolt push
```
