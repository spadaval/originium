# Migrate

Use this subskill for demolition, reconnect, closeout, and other planned migration
work where temporary downstream breakage is named, scoped, and handed off.

## First Classify The Bead

Read the bead, parent epic, and nearby siblings before editing. Follow
[repository workflow](../standards/repo-workflow.md) for git worktree checks,
and [beads.md](../standards/beads.md) for tracker mechanics and Dolt sync. Then
inspect the tracker:

```bash
bd show <id>
bd list --status=open
bd search "<legacy-or-target-term>"
```

Classify the work as one of:

- `demolition`: remove a legacy interface and intentionally break callers.
- `reconnect`: reconnect one owned slice to the target design after demolition.
- `closeout`: validate and clean up an integrated epic or phase.
- `ambiguous`: stop and resolve tracker/docs before editing.

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
- Record expected downstream breakage and the reconnect/closeout bead that owns
  it in bead notes or acceptance criteria.

Broad checks may fail after a valid demolition only when the breakage is named
and owned. Capture the exact failure and owning reconnect bead instead of hiding
it.

## Reconnect Rules

For reconnect beads:

- Reconnect the named owned slice to the target design.
- Update docs and tests for the reconnected seam.
- Use the new target contracts directly.
- Remove nearby legacy references rather than preserving compatibility paths.
- File follow-up beads for adjacent breakage outside the owned slice.

Focused validation proves the reconnected seam and satisfies the bead's
acceptance criteria, not the entire migration unless the bead is a closeout.

## Closeout Rules

For closeout beads:

- Inspect the parent epic and all open/closed child beads.
- Identify intentional temporary breakage recorded by demolition and reconnect
  beads.
- Confirm target docs and ADRs describe the implemented state.
- Run broad command validation and scenario validation appropriate to the epic.
- Prove or classify every parent epic validation criterion as passed, failed,
  blocked, deferred, or not applicable.
- Clean up migration debris: stale imports, deleted terminology in current
  docs, dead tests, obsolete notes, unused exports, package manifest drift, and
  temporary exceptions.
- File beads for remaining work outside the closeout bead's reasonable scope.

## Failure Classification

Classify command failures as:

- expected downstream breakage from demolition;
- in-scope blocker for the current reconnect or closeout;
- environment/tooling failure;
- unrelated pre-existing failure;
- newly discovered bug requiring follow-up.

Useful failure notes include command, package/file area, first concrete error,
whether it is expected, and bead that owns the fix.

## Handoff

For demolition handoff, include deleted legacy interfaces, validation run, known
broken callers or commands, and reconnect/closeout bead IDs.

For closeout handoff, include child beads inspected, docs/ADRs updated or
confirmed, broad checks run, validation scenarios and result states, remaining
failures, and follow-up bead IDs.

Follow [repository workflow](../standards/repo-workflow.md) for the handoff
git check, and [beads.md](../standards/beads.md) for pushing tracker state.
