---
name: orchestrate-epic
description: Use when acting as the primary orchestrator for an Originium epic or multi-bead workstream. Covers bead selection, Dolt and tracker preflight, subagent task shaping, checkpoint commits, code review, validation, closeout validation, and final handoff. Do not use for worker subagent implementation.
---

# Orchestrate Epic

Drive a coherent Originium epic to completion without losing tracker state,
subagent work, code-review signal, or validation evidence. This skill
is for the primary orchestrator. It is not for worker subagents, ordinary
named-bead implementation, read-only review assignments, or validator
assignments.

Use repo-local instructions as the authority:

1. `AGENTS.md`
2. `docs/agent/beads.md`
3. `.agents/skills/manage-beads/SKILL.md`
4. the execution skill for each assigned bead (`implement`,
   `breaking-migration`, `refresh-docs`, `architecture-audit`, `review-code`,
   or `validate-behavior`)
5. relevant docs, ADRs, parent epic notes, and child bead acceptance criteria

## Start Gate

Before assigning work, prove the local repo and tracker can absorb a long run:

```bash
git status --short --branch
bd dolt status
bd dolt pull
bd dolt push
bd ready
bd lint
bd show <epic-or-candidate>
```

Do not treat `bd lint` as a worker start gate. It is an orchestrator
tracker-readiness check.

If Dolt pull or push fails, stop orchestration and fix tracker sync first. For
broken Git-backed Dolt remotes, use the recovery guidance in
`.agents/skills/manage-beads/SKILL.md#dolt-backend-repair` after deciding
whether the local tracker should overwrite the remote.

If the worktree is dirty, classify each change before continuing. Keep unrelated
user changes intact. If the dirty state makes rollback unsafe, commit or ask for
direction before assigning workers.

## Epic Orchestration Checklist

Use this as the working checklist for a long epic. The detailed sections below
explain each step, but this list is the quick guard against skipping process:

1. Pull and push Dolt before graph shaping or worker assignment.
2. Review the parent epic, all open children, blockers, sibling overlap, and
   existing closeout or validation beads.
3. Ensure each executable child names scope, out-of-scope work, acceptance
   criteria, and proof commands or proof method.
4. Ensure every epic validation criterion is owned by child proof, a validation
   bead, the closeout bead, or an explicit blocked/deferred/not-applicable
   classification.
5. Shape or close duplicate, vague, or stale beads before implementation starts.
6. Commit coherent implementation slices with the `.beads/issues.jsonl` backup
   when that tracker update records the same work.
7. Use `bd close <id> --reason "..."` for bead completion; use `bd update`
   for field edits and claiming.
8. Before closeout closes, run targeted residue searches for removed terms,
   classify historical ADR hits, reconcile docs, run broad validation, push
   Dolt, and verify `git status --short --branch` is clean.

## Pick And Shape The Work

Select the next epic from `bd ready` and dependency context. Prefer one coherent
epic or seam over opportunistic task hopping.

Before implementation:

- inspect the parent epic, open children, blockers, and closeout bead;
- inspect the epic's product-behavior or behavior-preservation validation
  criteria;
- confirm the ready children are independently executable;
- confirm every validation criterion is covered by implementation proof, a
  `validation` child, the final `closeout` child, or an explicit deferred,
  blocked, or not-applicable classification;
- ensure macro ordering lives on epic-to-epic blockers when possible;
- reshape vague or oversized beads before assigning them;
- create missing code review, validation, reconnect, or closeout beads
  when the graph cannot describe done.

Ready worker beads should name owned scope, out-of-scope work, expected
breakage, acceptance criteria, recommended skill, the validation criterion they
advance when applicable, and proof commands when those are not obvious.

Do not assign implementation on an epic whose acceptance criteria are only
code-shaped and omit behavior. For internal refactor epics, behavior may mean
preserved product/API/runtime behavior, removed-contract residue searches, and
focused tests around the changed seams.

## Subagent Delegation

Epic orchestration is delegation-oriented. A single agent session should not
try to complete a whole epic end to end; the orchestrator selects, shapes,
assigns, integrates, reviews, checkpoints, and steers. If delegation is not
available, reduce scope to planning, bead shaping, or one explicitly bounded
local slice rather than pretending the epic can be finished in one session.

Assign one coherent owned slice per worker, usually one to three beads. Avoid
parallel implementation unless write sets are clearly disjoint. Parallel
read-only exploration, standards validation, or review is usually safe when the
questions are separate.

Use these default spawn parameters unless the bead or risk profile clearly
calls for a different choice:

| Work type                     | `agent_type` | `model`        | `reasoning_effort` | Notes                                                                                                                                                           |
| ----------------------------- | ------------ | -------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General implementation        | `worker`     | `gpt-5.5`      | `low`              | Raise to `medium` or `high` for complex architecture, lifecycle, migration, persistence, or concurrency work.                                                   |
| Code review                   | `explorer`   | `gpt-5.2`      | `high`             | Load `review-code`. Keep read-only by default. Use for high-risk worker handoffs, public contracts, state machines, persistence, security, and broad refactors. |
| Behavior validation           | `explorer`   | `gpt-5.5`      | `low`              | Load `validate-behavior`. Start from scenarios, not diffs. Use for product, browser, live-runtime, integration, or preservation proof.                          |
| Simple high-volume inspection | `explorer`   | `gpt-5.4-mini` | `low`              | Use for code searches, residue checks, standards sweeps, import audits, and focused validation that is cheap but repetitive.                                    |

Use `fork_context: true` only when the subagent needs the current conversation
state to do the work correctly. Prefer a narrow self-contained prompt for
ordinary workers and explorers. Do not override the model merely because a newer
model exists; pick the cheapest model that fits the risk, ambiguity, and
expected reasoning depth.

Each worker prompt should include:

- exact bead IDs and the parent epic;
- which repo-local skill to load;
- owned files, modules, workflows, or architectural seam;
- what not to change;
- whether downstream breakage is expected;
- required docs, ADRs, or glossary terms;
- validation expected before handoff;
- the epic validation criterion advanced by the slice, when applicable;
- instruction that other agents may be editing the repo, so they must not
  revert unrelated work;
- instruction to list changed files, checks run, bead state changes, risks, and
  follow-up needs.

Do not delegate the immediate blocker when your next local step depends on its
answer. Do that work locally or wait intentionally.

## Checkpoint Commits

Commit after each approved subtask, bead, or small coherent bead group. The main
benefit is rollback safety: if a later worker damages the tree, the last good
slice can be restored without reconstructing lost work.

For each checkpoint:

```bash
git status --short
git diff --check
<focused validation>
git add <source/docs/tests>
git commit -m "<message>"
```

When tracker changes update `.beads/issues.jsonl`, explicitly stage it because
auto-export does not stage the file. If the tracker update records the same
work as the source, docs, or test change, prefer committing `.beads/issues.jsonl`
with that change. Use a tracker-only commit for tracker-only graph shaping,
delayed backup/export cleanup, or final epic closeout when no source,
docs, or test files changed.

Before assigning the next worker, make sure the previous checkpoint is either
committed or deliberately reverted. Do not accumulate several unreviewed worker
patches in one dirty tree.

## Code Review Use

Use `review-code` where an independent adversarial diff-centered pass is worth
the cost:

- state machines, persistence, concurrency, background workers, or lifecycle
  code;
- public contracts, SDK/API behavior, domain terminology, or architecture
  ownership changes;
- security, data loss, destructive deletion, or migration seams;
- broad refactors and closeout milestones;
- any worker handoff that reports uncertainty, skipped validation, or expected
  breakage.

For tiny docs-only, tracker-only, or mechanical beads, orchestrator review may
be enough. If a task is too small to justify review, consider batching it with a
related owned slice instead of spinning up a subagent for ceremony.

Reviewer prompts should be read-only by default. Ask for findings first, ordered
by severity, with file and line evidence, missing validation, and concrete
recommendations. Give reviewers the changed commit range or files, the bead IDs,
the acceptance criteria, and any expected migration breakage.

For high-risk beads, prefer that workers leave durable handoff notes and that
the reviewer or orchestrator closes the bead after review. If a worker already
closed a bead, review the result before treating closure as final.

## validation Use

Use `validate-behavior` for scenario-centered proof. Validators answer whether
the intended behavior works; they do not review the diff except as needed to
understand expected behavior.

The orchestrator decides when validators run. Schedule validators as soon as a
scenario becomes meaningful, not only at the end of an epic. Good trigger
points include a workflow becoming runnable, a UI state becoming renderable, a
live-runtime blocker clearing, a migration path becoming testable, or a
behavior-preservation refactor reaching a coherent seam.

Validator prompts should include:

- the validation bead ID or scenario name;
- the parent epic validation criterion;
- the proof method expected, if known;
- exact product/operator behavior to prove;
- test data, route, command, fixture, or environment hints;
- known expected breakage or deferred checks;
- evidence that must be recorded;
- instruction to be read-only unless explicitly assigned a reconnect.

validation can be satisfied by an integration test, Playwright/browser check,
scripted run, live/manual walkthrough, or static/refactor proof when that proof
exercises the intended behavior at the right level. Validator notes should
classify the result as pass, fail, blocked, deferred, or not applicable.

## Failure Handling

Classify failures quickly:

- in-scope defect to fix before the checkpoint;
- intentional migration breakage owned by a named follow-up or closeout
  bead;
- unrelated pre-existing failure;
- environment/tooling failure;
- out-of-scope discovered work that needs a new bead.

If a worker fails, refuses, or edits the wrong scope, recover deliberately:

- inspect the diff and preserve any useful isolated change;
- revert to the last checkpoint when the patch is unsafe;
- reshape the bead or prompt before retrying;
- create follow-up beads for real work instead of burying it in chat;
- document durable status in bead notes when future agents need it.

## Closeout And Handoff

Use `closeout` beads for repo-wide cleanup, broad command validation,
integrated validation, and reconnect cleanup. Do not expect every
intermediate migration bead to leave the whole repo compiling. Milestones are
program markers, not executable validation work.

Before closing the epic:

- run the closeout validation named by the bead graph;
- prove or classify every parent epic validation criterion;
- reserve `bun run check:full` for closeout, CI/mainline proof, or explicit
  full-validation requests; workers should normally run targeted tests for
  their changed slice;
- run targeted residue searches for removed terms, legacy imports, and old
  contracts;
- reconcile docs, ADRs, glossary, and bead notes with the implemented state;
- run `bd dolt push`;
- commit any remaining `.beads/issues.jsonl` tracker backup change;
- verify `git status --short --branch` is clean.

Final handoff should name the completed epic, commits, closed beads, validation
commands, intentional residual breakage, follow-up beads, and tracker/Dolt
status.
