---
name: agent-factory
description: "Use for Originium agent-factory work: planning bead graphs, orchestrating multi-bead execution, implementing assigned beads, deliberate migration breakage, code review, behavior validation, docs refresh, and architecture audit. The orchestrator assigns one role/route per subagent."
argument-hint: "[route] [target]"
user-invocable: true
---

# Agent Factory

The agent factory is Originium's role router for coordinated agent work. It
keeps planning, execution, review, validation, stewardship, and handoff as
separate responsibilities so agents can work from durable repo state instead of
private chat history.

## General Guidelines

- Use `docs/index.md` as the repository knowledge map.
- For delegated work, the orchestrator explicitly assigns one route to each
  subagent. A subagent should load only the assigned route reference unless the
  assignment says otherwise.
- Beads are the durable work queue. Use explicit `bd` commands and avoid
  interactive commands such as `bd edit`.
- Planning and execution are separate concerns. Do not reshape the bead graph
  while implementing unless graph management is the assigned route.
- Use the repo docs for code, architecture, validation, product, and quality
  rules. This skill owns role procedure and coordination mechanics.

## Routes

| Route         | Use For                                                                                   | Load                                                 |
| ------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `plan`        | Creating, splitting, sequencing, clarifying, or cleaning up beads                         | [reference/plan.md](reference/plan.md)               |
| `orchestrate` | Running an epic or multi-bead workstream and assigning subagents                          | [reference/orchestrate.md](reference/orchestrate.md) |
| `implement`   | Executing one ordinary assigned bead or owned slice                                       | [reference/implement.md](reference/implement.md)     |
| `migrate`     | Demolition, reconnect, closeout, or other intentional temporary breakage                  | [reference/migrate.md](reference/migrate.md)         |
| `review`      | Adversarial diff, code, design, architecture, security, or test-quality review            | [reference/review.md](reference/review.md)           |
| `validate`    | Scenario-centered product, operator, browser, runtime, integration, or preservation proof | [reference/validate.md](reference/validate.md)       |
| `docs`        | Documentation refresh, reconciliation, or docs/process drift cleanup                      | [reference/docs.md](reference/docs.md)               |
| `audit`       | Evidence-backed architecture or process-quality findings without implementing fixes       | [reference/audit.md](reference/audit.md)             |
| `beads`       | Beads command mechanics, issue standards, dependency rules, and tracker sync              | [reference/beads.md](reference/beads.md)             |

## Routing Rules

1. If the first argument is a route, load that route reference and follow it.
2. If no route is named, choose the smallest route that matches the user's
   request or assigned bead.
3. If the work is an epic or spans multiple beads, use `orchestrate`; the
   orchestrator may then assign subagents to other routes.
4. If the work starts from a diff, use `review`. If it starts from a scenario or
   behavior claim, use `validate`.
5. If a bead intentionally permits breakage, closes out a migration, or asks for
   demolition/reconnect classification, use `migrate`.
