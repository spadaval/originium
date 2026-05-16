# Validation

Validation proves that intended Originium behavior works. A test run satisfies
validation only when it exercises the intended behavior at the right level and
records enough evidence for a future agent to trust the result.

## Core Terms

- **Code review**: asks whether a change is well-built. It starts from the diff,
  design, contracts, and implementation risks.
- **Validation**: asks whether the intended product, operator, or agent-facing
  behavior works. It starts from a scenario and produces evidence.

A validation scenario:

```text
Given: starting state
When: user, operator, or agent action
Then: observable behavior
Evidence: proof method and record
```

A validation criterion is an epic-level behavior that must be true before the
epic can close. Every criterion should be covered by implementation proof, a
`validation` bead, the final `closeout` bead, or an explicit deferred, blocked,
or not-applicable classification.

## Result States

- `pass`: behavior was proven with the recorded evidence.
- `fail`: behavior does not work and must be fixed or tracked.
- `blocked`: environment, credentials, toolchain, local services, or
  prerequisite work prevents validation.
- `deferred`: validation is intentionally moved to a named bead, gate, PR, or
  closeout boundary.
- `not-applicable`: the scenario no longer applies because scope changed;
  record the reason.

Do not silently skip validation.

## Proof Methods

| Method                  | When to use                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit test               | Pure helpers, deterministic policies, parsing, ID generation, and local package behavior.                                                              |
| Integration test        | Behavior that crosses packages or runtime boundaries, persistence, lifecycle, artifact creation, schema application, migration, or workflow semantics. |
| Bundled CLI test        | Agent-facing command behavior. Prefer running `apps/cli/dist/originium` so tests prove the surface agents will actually use.                           |
| Scripted validation     | Behavior spanning SurrealDB, file buckets, Ollama, PDF fixtures, or local runtime startup that can be made repeatable without becoming a normal suite. |
| Browser validation      | UI viewer behavior: navigation, rendering, empty states, failure states, citation panels, graph neighborhoods, and layout.                             |
| One-off walkthrough     | Exploratory, credential-dependent, live-provider-dependent, expensive, or unstable scenarios. File follow-up work to automate repeatable parts.        |
| Static/type/build proof | Internal refactors with no visible product surface change. Prove preservation, removed-contract cleanup, and target ownership.                         |

## Validation Bead Authoring

A `validation` bead should be executable by a fresh validator without private
planning context. Put the durable scenario and procedure in the description;
keep `Acceptance Criteria` as the executable contract.

Recommended description shape:

```text
Scenario:
Given ...
When ...
Then ...

Proof method: unit | integration | bundled CLI | script | browser | live smoke | manual walkthrough | static/refactor

Procedure: exact commands or steps.

Evidence required: what to record in notes.

Pass criteria: observable behavior that must be true.

Failure classification: in-scope defect | environment blocked | deferred | not applicable | follow-up work
```

Validation notes should record the scenario name, commands or steps, observed
result, result state, failure classification, useful artifact paths, and
follow-up bead IDs. Do not paste raw prompts, generated code, full diffs, huge
logs, stdout/stderr dumps, source document body text, or secrets.

## Epic And Closeout Validation

An epic is ready only when it names real product, operator, or agent-facing
behaviors that must be true at the end. For internal refactors, those behaviors
may be preservation-oriented.

The orchestrator owns validation timing. Validators should be scheduled when a
scenario becomes meaningful, not only at the end.

A `closeout` bead owns final integrated proof and cleanup. It should not be the
first real attempt to validate the epic's core behavior. It should inspect child
handoff notes, rerun required scenario evidence, classify remaining failures,
reconcile docs and beads, and prove downstream work can rely on the epic
boundary.

## Command Gates

| Gate                              | Owner                                                 |
| --------------------------------- | ----------------------------------------------------- |
| `bun run check:typecheck`         | TypeScript type soundness                             |
| `bun run check:biome`             | Biome formatting, linting, import organization        |
| `bun run check:markdown`          | Markdown formatting                                   |
| `bun run check:build`             | Package and app build behavior                        |
| `bun test`                        | Unit and focused integration tests                    |
| `bun run test`                    | Build first, then run tests                           |
| `bun run check`                   | Normal static/build/docs source validation plus tests |
| `bd lint <id>`                    | Structure of one bead                                 |
| `bd lint` / `bun run check:beads` | Open tracker graph structure                          |

Command gates are evidence only when they exercise the intended behavior at the
right level. A typecheck alone usually proves only type soundness.

## Selection Principles

- Use narrow proof for an owned slice.
- Run targeted tests for the changed module, package, command, or workflow.
- Use broad gates for closeout, CI/mainline protection, explicit PR validation,
  or named phase boundaries.
- Use bundled CLI proof for agent-facing command behavior.
- Use live SurrealDB, PDF, and Ollama checks only when the scenario requires the
  actual external dependency.
- Do not recreate these validation areas with bespoke scripts unless the
  scenario is too specific for the shared gates.

## Failure Classes

- **In-scope failure**: the current change must resolve it.
- **Intentional migration breakage**: expected temporary breakage owned by named
  reconnect or closeout work.
- **Environment or tooling failure**: local runtime, dependency, service,
  credential, or tool problem prevents validation.
- **Unrelated pre-existing failure**: failure outside the owned slice that was
  already present.
- **Follow-up work**: real discovered work that should be tracked separately.

## Failure Reporting

When validation fails, report:

- the command or scenario,
- the input, record, file, or service identifier,
- the concrete failure,
- whether the failure is product behavior, test harness, environment, setup, or
  unrelated pre-existing behavior,
- the next useful action.
