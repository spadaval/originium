# Orchestrate

Use this subskill when acting as the primary orchestrator for an epic or multi-bead
workstream. The orchestrator selects, shapes, assigns, integrates, reviews,
checkpoints, and steers. Worker subagents use the subskill assigned to them, not
this subskill.

## Start Gate

Before assigning work, prove the local repo and tracker can absorb a long run:

Follow [repository workflow](../standards/repo-workflow.md) for the shared git
start and checkpoint rules, and [beads.md](../standards/beads.md) for tracker
mechanics and Dolt sync.

```bash
bd dolt status
bd dolt pull
bd dolt push
bd ready
bd lint
bd show <epic-or-candidate>
```

If Dolt pull or push fails, stop orchestration and fix tracker sync first. If
the worktree is dirty, classify each change before continuing and preserve
unrelated user changes.

## Orchestration Checklist

1. Pull and push Dolt before graph shaping or worker assignment.
2. Review the parent epic, open children, blockers, sibling overlap, and
   existing closeout or validation beads.
3. Ensure executable children name scope, out-of-scope work, acceptance
   criteria, and proof commands or proof method.
4. Ensure every epic validation criterion is owned by child proof, a validation
   bead, the closeout bead, or an explicit blocked/deferred/not-applicable
   classification.
5. Shape or close duplicate, vague, or stale beads before implementation starts.
6. Commit coherent implementation slices with the mapped tracker backup when
   the tracker update records the same work.
7. Use `bd close <id> --reason "..."` for bead completion; use `bd update` for
   field edits and claiming.
8. Before closeout closes, run residue searches, reconcile docs, run broad
   validation, push Dolt, and verify the worktree is clean.

## Subagent Delegation

Perform all real work through subagents.
Assign one coherent owned slice per worker, usually one to three beads.
Be careful with parallel subagents. Use them only when readers are parallel or
writers are clearly disjoint.

Each worker prompt should include:

- exact bead IDs and parent epic;
- assigned agent-factory role/subskill;
- owned files, modules, workflows, or architectural seam;
- what not to change;
- whether downstream breakage is expected;
- required docs, ADRs, or glossary terms;
- validation expected before handoff;
- epic validation criterion advanced by the slice, when applicable;
- instruction that other agents may be editing the repo and unrelated work must
  not be reverted;
- instruction to list changed files, checks run, bead state changes, risks, and
  follow-up needs.


Perform high-context actions yourself; A good guideline is if a subagent would require more than ~500 words of context to understand what to do.

## Review And Validation

Use the `review` subskill for high-risk diffs, public contracts, persistence,
security, migrations, broad refactors, and handoffs with uncertainty or skipped
checks.

Use the `validate` subskill for scenario-centered proof. Validators answer whether
the intended behavior works; they do not review the diff except as needed to
understand expected behavior.

## Checkpoint Commits

Commit after each approved subtask, bead, or small coherent bead group using
the [repository workflow](../standards/repo-workflow.md) checkpoint pattern.
When tracker changes update the mapped tracker backup, stage it explicitly.
Before assigning the next worker, make sure the previous checkpoint is either
committed or deliberately reverted.

## Closeout

Before closing an epic:

- run the closeout validation named by the bead graph;
- prove or classify every parent epic validation criterion;
- run targeted residue searches for removed terms, legacy imports, and old
  contracts;
- reconcile docs, ADRs, glossary, and bead notes with the implemented state;
- run `bd dolt push`;
- commit remaining tracker backup changes;
- verify the worktree is clean per [repository workflow](../standards/repo-workflow.md).

Final handoff names completed epic, commits, closed beads, validation
commands, residual breakage, follow-up beads, and tracker/Dolt status.
