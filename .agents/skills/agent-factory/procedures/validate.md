# Validate

Use this subskill for validation beads, assigned validation scenarios, and
scenario-centered closeout checks. Validation starts from the intended behavior,
not from the diff.

## Start Gate

Follow [repository workflow](../standards/repo-workflow.md) for git worktree
checks, and [beads.md](../standards/beads.md) for tracker mechanics and Dolt
sync. Then inspect the validation bead and parent epic:

```bash
bd show <validation-or-closeout-id>
bd show <parent-epic-id>
```

Read only the docs and beads needed to understand the assigned scenario,
expected behavior, test data, environment, and known breakage. Do not reshape
the epic or reschedule validation unless explicitly assigned planning work.

## Validation Stance

Be adversarial about behavior:

- Start from the product or operator claim, not the implementation plan.
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
- **Browser or Playwright validation**: UI state, navigation, interaction,
  failure rendering, empty states, or responsive behavior.
- **Scripted validation**: repeatable service, container, CLI, or operator flow.
- **One-off walkthrough**: exploratory, credential-dependent, provider-dependent,
  expensive, or not-yet-stable behavior.
- **Static/refactor proof**: public behavior is preserved; combine
  targeted tests, type/build checks, residue searches, and representative
  scenario proof where risk warrants it.

For browser-visible behavior, assert on DOM and state. Cover desktop and
mobile when responsive behavior matters.

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

Do not paste raw prompts, generated source, full diffs, huge logs, raw stdout or
stderr dumps, or secrets.

## Failure Handling

Classify every non-pass:

- in-scope defect;
- intentional migration breakage owned by a named bead;
- environment or tooling failure;
- unrelated pre-existing failure;
- deferred validation with a named owner;
- not applicable because scope changed.

If validation is blocked, record the missing precondition and exact command or
step that hit it. If behavior fails, state the user/operator-visible failure and
recommend the next bead shape rather than silently broadening scope.

## Handoff

Before closing a validation bead, confirm acceptance criteria are satisfied or
explicitly classified. Follow
[repository workflow](../standards/repo-workflow.md) for the handoff git check,
and [beads.md](../standards/beads.md) for pushing tracker state.

Handoff names the scenario result, evidence, checks or steps run,
failures, follow-up beads, and deferred validation.
