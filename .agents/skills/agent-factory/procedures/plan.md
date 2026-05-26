# Plan

Use this subskill when creating, splitting, reparenting, sequencing, clarifying, or
cleaning up beads. Planning decides what work exists, what is ready, and how
work is sequenced. It is not the implementation procedure for a named
code bead.

## Inspect Before Mutating

Start with enough read-only context to prevent duplicate or contradictory graph
changes. Follow [repository workflow](../standards/repo-workflow.md) for git
worktree checks, and [beads.md](../standards/beads.md) for tracker mechanics,
Dolt sync, and tracker command conventions. Then inspect the tracker and graph:

```bash
bd list --status=open
bd ready
bd lint
bd lint <id>
bd search "<topic>"
bd show <id>
```

Read parent epics, siblings, blockers, relevant ADRs, and existing decision
beads before changing meaning or sequencing.

## Planning Flow

```text
Problem or Goal
      |
      v
[ Understand ] -- Read docs, ADRs, existing beads, current system
      |
      v
[ Shape ] -- Split, sequence, name scope and acceptance criteria
      |
      v
[ Verify ready ] -- Can a future agent execute without hidden context?
      |
      v
[ Assign or queue ] -- Hand to orchestrator or leave in ready state
```

A ready bead must answer what, why, in scope, out of scope, how to prove it, and
which subskill to load when assignment is not obvious.

## Bulk Bead Creation

When creating a planned group of beads with dependencies, use
`bd create --graph <plan.json>` instead of long command substitutions when any
of these apply:

- creating more than three beads at once;
- assigning parent-child relationships while creating children;
- adding dependency edges between newly created beads;
- using labels, priorities, assignees, custom metadata, or metadata references;
- wanting the graph to be created atomically.

Graph dependency direction matches `bd dep add <blocked> <blocker>`:
`from_key` is blocked, and `to_key` is the prerequisite.

Use `bd create -f <issues.md>` when Markdown readability matters more than
symbolic wiring. Use `bd import` only for generated migrations, backups, and
explicit-ID plans.

## Reshaping Existing Beads

Fix unclear scope, missing acceptance criteria, or stale blockers on any bead you
edit. Preserve the bead ID and human intent where possible.

If meaning changes materially:

- update the description or acceptance criteria;
- add a note explaining why it changed;
- adjust parent/blocker links;
- create follow-up beads for split-out work;
- add a subskill recommendation or phase tag when useful.

Do not perform a broad tracker rewrite unless the user asks for one. Improve
the area you are already managing.

## Handoff

At handoff, the bead graph must be clearer than when you started. Report
beads created or changed, dependency changes, validation or lint run, remaining
ambiguity, and any follow-up decisions needed.

Follow [repository workflow](../standards/repo-workflow.md) for the handoff
git check, and [beads.md](../standards/beads.md) for pushing tracker state.
