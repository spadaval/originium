---
name: implement
description: Use when implementing an ordinary executable Originium bead such as a focused task, bug, feature, story, or reconnect slice. Do not use for epic planning, bead graph management, demolition, massive breaking migration, or closeout milestone work.
---

# Implement

Use this skill for ordinary executable beads where the goal is to change code,
tests, or docs for one owned slice.

Do not use this skill for:

- creating, splitting, reparenting, or sequencing beads; use `manage-beads`;
- demolition, massive breaking changes, or closeout beads; use
  `breaking-migration`;
- validation beads; use `validate-behavior`;
- frontend design-heavy work; use the repo's frontend guidance and the
  inspection UI acceptance criteria alongside the bead workflow.

Repo-local instructions are authoritative over global or generic skills:

1. `AGENTS.md`
2. `docs/agent/beads.md` as needed for tracker mechanics
3. `CONTEXT.md`
4. `docs/architecture/quality/index.md`
5. current ADRs under `docs/adr/`
6. the bead's description, notes, acceptance criteria, and blockers

Do not expand into architecture, operations, product, or ADR docs unless the
bead, `Acceptance Criteria`, this skill, or a concrete ambiguity calls for
them.

## Start Gate

Before implementation:

```bash
git status --short --branch
bd show <id>
```

Use `bd <command> --help` when command syntax is unclear. Do not rely on
`bd prime`; Originium's repo-local docs and skills are the process source of
truth.

`bd lint` is an orchestrator tracker-readiness check. Do not block ordinary
implementation on bead-template lint unless tracker quality is the task.

This skill is for a named executable bead. Do not scan the ready queue unless
you are selecting work or coordinating the graph.

Claim only when the bead is the work you are about to do:

```bash
bd update <id> --claim
```

## Scope Check

Before editing, verify:

- the bead has no active blockers;
- the request matches the bead's scope;
- the package, app, workflow, file, or owned area is clear enough to start;
- Beads-native `Acceptance Criteria` or intended behavior are discoverable,
  including the practical proof expected for the owned slice;
- the parent epic validation criterion advanced by this slice is clear when the
  bead belongs to an epic with product or operator validation criteria;
- the bead is not really demolition, closeout, or graph management work.

If the bead is unclear, inspect only enough parent-epic, sibling-bead, ADR, or
doc context to name the ambiguity. Do not reshape the graph unless explicitly
assigned manager work; ask the manager or record the blocker with the concrete
missing decision.

## Implementation Rules

- Originium is docs-first. Update docs before or alongside code when changing
  ownership, contracts, runtime flow, architecture, or user-visible behavior.
- During active rewrites, docs are the target design unless they are clearly
  stale, contradictory, or incomplete.
- Refactors do not keep backwards compatibility. Do not add shims, deprecated
  wrappers, compatibility symlinks, transitional aliases, dual paths, or
  old-path re-exports.
- Prefer one coherent owned slice over a narrow symptom patch.
- Bias toward test-driven development for behavior changes, bug fixes, contract
  changes, and non-trivial refactors.
- Skip tests only when the bead is pure deletion, mechanical rename, docs-only,
  tracker-only, or the missing harness would add more noise than signal.

## Validation

Use `docs/architecture/quality/validation.md` as the validation command router.
Run the narrowest checks that prove the owned slice and satisfy the bead's
`Acceptance Criteria`. Run tests for the changed module, package, or workflow;
do not default to the whole test suite or repo-wide validation unless the bead
explicitly asks for it.

A test run can satisfy validation when it exercises the intended
behavior at the right level. If the bead advances a parent epic validation
criterion, name that criterion in the handoff and state which proof supports
it. Broader product-scenario proof belongs to `validation` or `closeout`
beads unless the current bead explicitly owns it.

For CLI behavior, prefer tests or scripts that run the bundled executable at
`apps/cli/dist/originium`. For live dependencies such as SurrealDB, PDF
extraction, or Ollama, use scripted validation only when the bead's acceptance
criteria require the real dependency.

If a broader check fails because the repo is intentionally mid-migration,
record the exact command, concrete failure shape, and bead expected to reconnect
or close it out.

Do not create bespoke forbidden-shape checks for deleted names, forbidden
imports, Promise exports, dependency direction, or project graph hygiene.
Biome, Prettier, markdownlint-cli2, Knip, TypeScript, tests, docs/ADRs, and the
file-size checker own those validation areas.

## Tracker Hygiene

Use beads to preserve real follow-up work:

```bash
bd update <id> --append-notes "..."
bd create --title="..." --type=bug --priority=2 --description="..."
bd create --title="..." --type=decision --priority=2 --description="..."
bd create --title="..." --type=spike --priority=2 --description="..."
bd dep add <blocked-id> <blocker-id>
bd close <id>
bd dolt push
```

Avoid `bd edit`; it opens an interactive editor and blocks agents. Use explicit
`bd update` flags instead.

Create follow-up beads for bugs, missing validation, cleanup work, decision
gaps, or newly discovered ordering constraints. Keep the current bead focused
unless the user explicitly broadens scope.

## Handoff

Before stopping, leave concise handoff context:

- bead status;
- docs changed;
- code/test files changed;
- checks run and results;
- parent epic validation criterion advanced, when applicable;
- expected failures, if any;
- follow-up bead IDs.

Push beads state with `bd dolt push` before handoff.
