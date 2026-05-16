---
name: validate-behavior
description: Use for adversarial product, operator, browser, live-runtime, integration, or preservation validation. Starts from a validation scenario and records evidence that intended behavior works or clearly classifies why it does not.
---

# Validate Behavior

Use this skill for `validation` beads, assigned validation scenarios,
and scenario-centered closeout checks. This is not code review. Code review
starts from the diff; validation starts from the scenario.

Repo-local instructions are authoritative:

1. `AGENTS.md`
2. `docs/architecture/quality/validation.md`
3. `docs/agent/beads.md` when bead mechanics matter
4. the assigned bead, parent epic validation contract, relevant docs, ADRs, and
   known expected breakage

## Start Gate

Before validation:

```bash
git status --short --branch
bd show <validation-or-closeout-id>
bd show <parent-epic-id>
```

Read only the docs and beads needed to understand the assigned scenario,
expected behavior, test data, environment, and known breakage. Do not reshape
the epic or reschedule validation work unless explicitly assigned; that is the
orchestrator's job.

## Validation Stance

Be adversarial about behavior:

- Start from the product or operator claim, not from the implementation plan.
- Try to disprove that the scenario works.
- Prefer observable behavior over internal assumptions.
- Keep the pass/fail path reproducible.
- Do not fix defects unless the bead explicitly assigns implementation work.
- File or recommend follow-up beads for real discovered work.

## Choose The Proof

Use the proof method named by the bead. If the bead leaves it open, choose the
smallest proof that genuinely exercises the scenario:

- **Integration test**: deterministic cross-package, persistence, lifecycle,
  migration, or workflow behavior.
- **Browser or Playwright validation**: inspection UI state, navigation,
  interaction, failure rendering, empty states, citation panels, graph
  neighborhoods, or responsive behavior.
- **Scripted validation**: repeatable service, container, CLI, or operator flow.
- **One-off walkthrough**: exploratory, credential-dependent, provider-dependent,
  expensive, or not-yet-stable behavior.
- **Static/refactor proof**: internal refactor where public behavior should be
  preserved; combine targeted tests, type/build checks, residue searches, and
  representative scenario proof where risk warrants it.

For browser-visible behavior, prefer DOM and state assertions. Cover desktop
and mobile viewports when responsive behavior matters. Screenshots are useful
evidence and debugging artifacts, but they are not the primary pass/fail gate
unless the bead explicitly asks for visual regression coverage.

## Evidence

Record concise evidence in bead notes:

- scenario name or criterion;
- proof method;
- commands or manual/browser steps;
- observed result;
- result state: `pass`, `fail`, `blocked`, `deferred`, or `not-applicable`;
- failure classification and first concrete failure, when relevant;
- artifact paths, screenshots, run IDs, or logs only when useful and bounded;
- follow-up bead IDs.

Do not paste raw prompts, generated source, full diffs, huge logs, raw stdout
or stderr dumps, or secrets.

## Failure Handling

Classify every non-pass:

- in-scope defect;
- intentional migration breakage owned by a named bead;
- environment or tooling failure;
- unrelated pre-existing failure;
- deferred validation with a named owner;
- not applicable because scope changed.

If validation is blocked, record the missing precondition and the exact command
or step that hit it. If behavior fails, state the user/operator-visible failure
and recommend the next bead shape rather than silently broadening scope.

## Handoff

Before closing a validation bead, confirm its `Acceptance Criteria` are
satisfied or explicitly classified. Push tracker state before handoff when
bead notes or status changed:

```bash
bd update <id> --append-notes "..."
bd close <id>
bd dolt push
```

Handoff should name the scenario result, evidence, checks or steps run,
failures, follow-up beads, and any validation that remains deferred.
