# Beads Workflow

Beads is the durable issue tracker for Originium agent work.

## Core Commands

```bash
bd ready
bd list --status=open
bd show <id>
bd search "<topic>"
bd update <id> --claim
bd update <id> --append-notes "..."
bd close <id> --reason "..."
bd dep add <blocked-id> <blocker-id>
bd dep remove <blocked-id> <blocker-id>
bd lint
bd lint <id>
```

Avoid `bd edit`; it opens an interactive editor and can block agents. Use
explicit `bd update` flags instead.

## Issue Quality

A ready executable bead should name:

- the concrete behavior or artifact to change,
- in-scope and out-of-scope work,
- the relevant package, app, schema, doc, or CLI surface,
- acceptance criteria,
- proof commands or validation scenarios,
- blockers and dependencies.

Do not leave vague executable work in the ready queue. Split broad work into
owned slices with clear dependencies.

## Issue Types

Originium uses the built-in Beads types plus configured custom types.

Built-in types used by the agent workflow include:

- `milestone`: a non-executable progress or release boundary that depends on
  the epics or closeouts that prove the milestone state. Milestones should
  briefly describe the final state and should not duplicate implementation or
  validation work.

Custom types:

- `validation`: scenario proof for product, operator, integration, browser, or
  behavior-preservation workflows. Validation beads should recommend
  `validate-behavior`, depend on the implementation they prove, and include the
  scenario, procedure, required evidence, pass criteria, and failure
  classification in the description.
- `closeout`: final integrated proof, cleanup, and handoff for an epic or
  phase. Closeout beads should recommend `breaking-migration` and
  `validate-behavior` when scenario proof is required, depend on the work they
  close, and classify every parent validation criterion as passed, deferred,
  blocked, or not applicable.
  Use implementation types such as `task` or `feature` for building behavior.
  Use `validation` when the bead exists to prove behavior rather than implement
  it. Use `closeout` when the bead exists to integrate, verify, clean up, and
  handoff an epic or phase. Use the built-in `milestone` type to mark a durable
  product or delivery state after its proving work is complete.

## Tracker Sync

For long orchestrated work, check tracker health before assigning work:

```bash
bd dolt status
bd dolt pull
bd dolt push
bd lint
```

If Dolt sync fails, stop orchestration and fix tracker state before spawning or
assigning more work.

## Handoff

Closeout notes should include:

- changed paths or tracker areas,
- validation commands run,
- failures or skipped checks,
- remaining risks,
- follow-up beads created or updated.
