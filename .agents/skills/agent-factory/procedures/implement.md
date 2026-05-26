# Implement

Use this subskill for ordinary executable beads where the goal is to change code,
tests, or docs for one owned slice.

Do not use this subskill for graph planning, demolition, breaking migration,
closeout work, independent validation, or read-only review.

## Start Gate

Follow [repository workflow](../standards/repo-workflow.md) for git worktree
checks, and [beads.md](../standards/beads.md) for tracker mechanics and Dolt
sync. Then verify the bead:

```bash
bd show <id>
```

Claim only when the bead is the work you are about to do:

```bash
bd update <id> --claim
```

Do not scan the ready queue unless you are selecting work or coordinating the
graph. `bd lint` is an orchestrator tracker-readiness check, not an ordinary
worker start gate.

## Scope Check

Before editing, verify:

- the bead has no active blockers;
- the request matches the bead scope;
- the package, app, workflow, file, or owned area is clear enough to start;
- acceptance criteria or intended behavior are discoverable;
- the expected proof for the owned slice is clear;
- the parent epic validation criterion advanced by the slice is clear, when
  applicable;
- the bead is not really demolition, closeout, validation, review, or graph
  management work.

If the bead is unclear, inspect only enough parent-epic, sibling-bead, ADR, or
doc context to name the ambiguity. Do not reshape the graph unless explicitly
assigned planning work.

## Implementation Rules

- Update mapped docs before or alongside code when changing ownership,
  contracts, runtime flow, architecture, or user-visible behavior.
- During active rewrites, docs are the target design unless they are clearly
  stale, contradictory, or incomplete.
- Legacy compatibility is not preserved unless the assigned bead explicitly
  makes compatibility the deliverable. Do not add shims, deprecated wrappers,
  compatibility symlinks, transitional aliases, dual paths, or old-path
  re-exports.
- Prefer one coherent owned slice over a narrow symptom patch.
- Bias toward test-driven development for behavior changes, bug fixes, contract
  changes, and non-trivial refactors.
- Skip tests only when the bead is pure deletion, mechanical rename, docs-only,
  tracker-only, or the missing harness would add more noise than signal.

## Validation

Use the mapped validation router for check ownership. Run the narrowest checks
that prove the owned slice and satisfy the bead's acceptance criteria. Do not
default to the whole suite unless the bead asks for it.

If a broader check fails because the repo is intentionally mid-migration,
record the command, concrete failure shape, and bead expected to reconnect or
close it out.

## Tracker Hygiene

Create follow-up beads for bugs, missing validation, cleanup work, decision
gaps, or newly discovered ordering constraints. Keep the current bead focused
unless the user explicitly broadens scope.

Do not use `bd edit`; see [beads.md](../standards/beads.md) for tracker command conventions.

## Handoff

Before stopping, leave concise handoff context:

- bead status;
- docs changed;
- code/test files changed;
- checks run and results;
- parent epic validation criterion advanced, when applicable;
- expected failures, if any;
- follow-up bead IDs.

Follow [repository workflow](../standards/repo-workflow.md) for the handoff
git check, and [beads.md](../standards/beads.md) for pushing tracker state.
