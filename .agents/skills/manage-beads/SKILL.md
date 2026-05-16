---
name: manage-beads
description: Use when creating, splitting, reparenting, sequencing, clarifying, or cleaning up Originium beads. Encodes Originium bead quality rules, recommended skill hints, migration phases, closeout milestones, and dependency discipline.
---

# Manage Beads

Maintain a beads graph that lets a fresh agent execute work without hidden
planning context.

This is an orchestrator skill. Use it for deciding what work exists, what is
ready, how work should be split, and how beads should be sequenced. Do not use
it as the implementation procedure for a named code bead.

Repo-local instructions are authoritative over global or generic skills:

1. `AGENTS.md`
2. repo-local skills under `.agents/skills/`
3. `docs/agent/beads.md`
4. `CONTEXT.md`
5. current ADRs under `docs/adr/`
6. existing bead descriptions, notes, acceptance criteria, blockers, and parent
   epics

Use `docs/adr/` for ADRs. Do not assume a root `docs/adr/`
directory. Use `docs/architecture/quality/validation.md` for validation command
meanings, scenario authoring, and product and operator validation.

## Inspect Before Mutating

Start with enough read-only context to avoid duplicate or contradictory graph
changes:

```bash
git status --short --branch
bd dolt status
bd dolt pull
bd dolt push
bd list --status=open
bd ready
bd lint
bd lint <id>
bd search "<topic>"
bd show <id>
```

Use `bd <command> --help` when command syntax is unclear. Do not rely on
`bd prime`; Originium's repo-local docs and skills are the process source of
truth.

Avoid `bd edit`; it opens an interactive editor and blocks agents. Use explicit
`bd update` flags instead.

Inspect parent epics, siblings, blockers, current ADRs, and existing decision
beads before changing meaning or sequencing.

`bd lint` belongs to orchestration and tracker hygiene. Do not require ordinary
implementation workers to run it as a start gate.

## Ready Bead Standard

A ready executable bead should answer, without requiring private context:

- what package, app, workflow, file area, interface, or owner is being changed;
- why the work exists;
- what is in scope;
- what is out of scope;
- what `Acceptance Criteria` define done and how the agent proves it;
- which epic validation criterion the bead advances, when it belongs to an
  epic with product or operator behavior criteria;
- what docs or ADRs are relevant, when the worker needs them to avoid hidden
  planning context;
- whether downstream breakage is expected;
- which bead owns later reconnect or closeout, when breakage is expected;
- which repo-local skill is recommended, when routing is non-obvious.

Do not leave vague executable beads in the ready queue. If a bead is too large,
ambiguous, missing prerequisites, or hiding several deliverables, reshape it
before treating it as executable.

If a worker must read a specific architecture, product, operations, validation,
or ADR doc to execute the bead correctly, name it in the description or
`Acceptance Criteria`.

Recommended skills are optional. Add them when they reduce routing ambiguity;
skip them for obvious, tiny, docs-only, or already well-constrained beads.

Use:

```text
Recommended skill: implement
```

or:

```text
Recommended skills: implement
```

## Description Vs Notes

Use the description for stable intent:

- problem or purpose;
- scope and out of scope;
- target owner;
- context that helps the agent interpret `Acceptance Criteria`;
- relevant docs, ADRs, or parent epic context.

Use Beads-native `Acceptance Criteria` for the executable contract. Do not split
validation proof into a separate section. Acceptance criteria should mix
product, docs, code, and proof expectations as needed: focused commands, named
checks, explicit deferred validation, or intentional migration breakage all
belong there when they define done.

Use notes for durable session context:

- handoff;
- migration phase tags;
- current state;
- why a bead was reshaped;
- known risks;
- expected temporary breakage;
- recommended follow-up path;
- command failures that future agents need to understand.

Notes do not replace acceptance criteria.

## Shape By Bead Type

`epic`:

- names the outcome, not just a theme;
- names product or operator behaviors the epic must prove; internal refactor
  epics may instead name behavior-preservation criteria, residue searches,
  focused tests, and representative scenarios;
- groups related child beads;
- is independently actionable: its own open children should not be blocked by
  work owned by another epic;
- may depend on other epics for macro ordering;
- has a final `closeout` child;
- has explicit `validation` children when a scenario requires its own workflow,
  fixture, browser check, live smoke, manual walkthrough, or integration proof;
- has every validation criterion covered by implementation proof, a
  `validation` child, the final `closeout` child, or an explicit deferred,
  blocked, or not-applicable classification;
- uses `blocks` for external sequencing, not parent-child hierarchy;
- keeps cross-epic prerequisites on the epic itself whenever possible instead
  of leaving child beads blocked by another epic.

`task`, `feature`, `story`, `bug`:

- should be executable by one worker without hidden planning;
- should name owned scope and `Acceptance Criteria` that include both desired
  outcome and practical proof;
- should recommend `implement` when routing is not obvious;
- should not include broad repo-wide cleanup unless it is a closeout bead.

`demolition` work:

- may be a `task`, but must be marked with `[DEMOLITION]` in notes or
  description;
- should recommend `breaking-migration`;
- names the legacy interface to remove;
- names expected downstream breakage;
- names the reconnect or closeout bead that owns reconnecting callers;
- explicitly forbids compatibility aliases, wrappers, shims, dual imports, and
  transitional re-exports.
- includes demolition proof in `Acceptance Criteria`, such as the deleted
  interface being unavailable and broad compile breakage being expected only
  when owned by named follow-up beads.

`reconnect` work:

- should be marked with `[RECONNECT]` when part of a breaking migration;
- recommends `implement` for narrow reconnects or `breaking-migration` for reconnect
  slices that still need migration failure classification;
- names the target seam to reconnect;
- includes focused tests or validation for that seam in `Acceptance Criteria`;
- avoids preserving legacy contracts.

`validation` (configured custom issue type):

- starts from a product, operator, live-runtime, browser, integration, or
  behavior-preservation scenario, not a diff;
- recommends `validate-behavior`;
- names the proof method: integration test, Playwright/browser check,
  scripted/CLI run, live smoke, manual walkthrough, or static/refactor proof;
- includes scenario, procedure, required evidence, pass criteria, and failure
  classification in the description;
- uses `Acceptance Criteria` as the executable validation contract;
- should not implement fixes unless explicitly scoped as validation plus reconnect.

`closeout`:

- should be marked with `[CLOSEOUT]` when it closes an epic or phase;
- recommends `breaking-migration`, and `validate-behavior` when product or
  operator scenario proof is required;
- owns integrated command validation, validation, and cleanup through
  `Acceptance Criteria`;
- lists the broad checks or cleanup categories expected in `Acceptance Criteria`;
- verifies every parent epic validation criterion is passed, deferred to a named
  owner, blocked with a concrete reason, or not applicable because scope
  changed;
- does not hide feature implementation work.

`milestone`:

- marks program progress or a release boundary;
- should not own executable validation work;
- should depend on `closeout` beads rather than duplicate their proof.

`spike`:

- reduces uncertainty, it does not implement the answer;
- should be marked with `[SPIKE]` when part of migration or rollout work;
- names the question to answer;
- defines the bounded evidence or diagnostic output expected;
- says what kind of follow-up bead should be created when the answer is known.

`decision`:

- records durable architecture, domain, or process choice;
- includes rationale, consequences, and alternatives when useful;
- should update relevant docs or ADRs when the decision changes the target
  design;
- should not be used for ordinary implementation notes.

`chore`, docs-only, tracker-only:

- should still say what changes and how to know it is done;
- may skip recommended skills when the scope is obvious.

## Recommended Skill Defaults

- Epic orchestration or delegated multi-bead workstream: `orchestrate-epic`
- Ordinary focused implementation: `implement`
- Frontend UI implementation or design-heavy polish: `implement` plus the
  frontend guidance in the system/developer instructions.
- Frontend audit without code changes: `review-code` or `validate-behavior`,
  depending on whether the question starts from a diff or a scenario.
- Docs-only updates, stale-doc audits, or docs/code reconciliation:
  `refresh-docs`
- Behavior validation: `validate-behavior`
- Code review: `review-code`
- Demolition, massive seam replacement, intentional temporary breakage:
  `breaking-migration`
- Closeout validation: `breaking-migration`, `validate-behavior`
- Bead graph creation, splitting, reparenting, sequencing, cleanup:
  `manage-beads`

Use the smallest set that fits. Do not add a recommended skill just to add
ceremony.

## Migration Phases

Use phase tags when a bead's behavior differs from ordinary implementation:

- `[DEMOLITION]`: remove a legacy interface in place. Downstream callers may
  break. Do not add compatibility aliases, wrappers, shims, dual imports, or
  transitional re-exports.
- `[RECONNECT]`: reconnect a specific owned seam to the target design. Restore
  focused behavior and tests for that seam.
- `[CLOSEOUT]`: validate an integrated epic result, clean up temporary
  migration damage, run broad checks, and prove or classify parent epic
  validation criteria.
- `[SPIKE]`: gather bounded evidence and recommend follow-up. Do not smuggle in
  runtime changes unless the bead is explicitly expanded.

Every epic should end with a `closeout` bead that owns repo-wide compile,
test, lint, build, docs, scenario validation, and cleanup as appropriate for
that epic.

## Dependency Discipline

Use parent-child for grouping under epics:

```bash
bd update <child-id> --parent <epic-id>
```

Use `blocks` only for real sequencing:

```bash
bd dep add <blocked-id> <blocker-id>
bd dep remove <blocked-id> <blocker-id>
```

Do not over-sequence. Parallel work is allowed unless a real prerequisite says
otherwise. Do not use `blocks` to mean "same epic", "preferred order", or
"probably related".

For epics, prefer epic-to-epic blockers for macro ordering. If a child bead is
blocked by work owned by another epic, try moving that prerequisite to the epic
itself or reshaping the child set so the epic remains independently actionable.

Keep downstream epic sequencing on epic-to-epic blockers unless a more precise
edge is clearly needed and supported.

## Reshaping Existing Beads

When you touch an existing weak bead, improve it enough for the next agent.
Prefer preserving the bead ID and human intent over recreating it.

If meaning changes materially:

- update the description or acceptance criteria;
- add a note explaining why it changed;
- adjust parent/blocker links;
- create follow-up beads for split-out work;
- add recommended skills or phase tags when useful.

Do not perform a giant tracker rewrite unless the user asks for one. Improve
the beads in the area you are already managing.

## Docs And Decisions

Originium is docs-first. If graph restructuring changes architecture,
ownership, contracts, runtime flow, user-visible behavior, or process
expectations, update the relevant docs or create a decision bead.

Historical ADR text is not the normal read path.

## Commands

```bash
bd create --title="..." --type=task --priority=2 --description="..." --acceptance="..."
bd create --title="..." --type=spike --priority=2 --description="..."
bd create --title="..." --type=decision --priority=2 --description="..."
bd create --title="..." --type=validation --priority=2 --description="..." --acceptance="..."
bd create --title="..." --type=closeout --priority=2 --description="..." --acceptance="..."
bd update <id> --type task
bd update <id> --parent <epic-id>
bd update <id> --description "..."
bd update <id> --acceptance "..."
bd update <id> --append-notes "..."
bd dep add <blocked-id> <blocker-id>
bd dep remove <blocked-id> <blocker-id>
bd show <id>
bd search "<topic>"
bd list --status=open
bd ready
bd lint
bd lint <id>
bd dolt status
bd dolt pull
bd dolt push
```

## Tracker Backup Commit

`.beads/issues.jsonl` is the automated committed backup/export of the bead
tracker. Tracker updates are allowed and expected to update this one file.
Auto-export does not stage it. After tracker mutations are complete, run the
normal tracker sync and explicitly stage and commit `.beads/issues.jsonl` so
the backup stays in sync with the tracker.

When source, docs, or test edits satisfy the same bead whose tracker state was
updated, prefer committing the `.beads/issues.jsonl` backup with those edits.
That keeps the code/docs/test proof and the tracker record in one coherent
commit.

Use a tracker-only commit for tracker-only graph shaping, delayed backup/export
cleanup, or final epic closeout when no source, docs, or test files
changed. Do not mix unrelated source, docs, or test edits into a tracker-only
commit.

## Dolt Backend Repair

Dolt maintenance is an orchestrator responsibility and should happen before
major tracker or multi-agent work. At minimum, verify:

```bash
bd dolt status
bd dolt pull
bd dolt push
```

If the remote is merely divergent, reconcile it before assigning workers. If
the remote is broken with errors like `Blob not found: <hash>.darc` or
`branch "main" not found on remote`, decide whether the local tracker is
authoritative. When it is, repair the Git-backed Dolt remote by deleting and
recreating `refs/dolt/data`:

```bash
git push <dolt-git-remote> :refs/dolt/data
bd dolt stop
cd .beads/dolt/originium
dolt remote remove origin
dolt remote add --ref refs/dolt/data origin <dolt-git-remote>
dolt push --force origin main
cd ../../..
bd dolt start
bd dolt pull
bd dolt push
```

Only use this destructive overwrite after confirming the local tracker state
and `.beads/issues.jsonl` backup are the desired source of truth.

At handoff, the bead graph should be clearer than when you started.
