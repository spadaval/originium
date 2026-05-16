---
name: refresh-docs
description: Use when updating, auditing, reconciling, or refreshing Originium docs after code, architecture, product, process, or migration changes.
---

# Refresh Docs

Use this skill when documentation freshness is the task, or when a bead's main
output is reconciling docs with target design, code, beads, or agent process.

Do not use this as a generic implementation checklist. Ordinary implementation
work should update docs when needed, but this skill is for focused docs work.

## Source Map

Use the right documentation home:

This source map is for docs-refresh work after the skill is selected. It is not
a mandatory read path for ordinary implementation agents.

- `CONTEXT.md`: canonical Originium glossary. Include domain concepts meaningful
  to Originium readers; do not add implementation packages, file names, or
  temporary migration mechanics as domain terms.
- `docs/architecture/`: architecture entry point and ownership map.
- `docs/architecture/index.md`: runtime topology, local services, processes,
  CLI execution, and runtime boundaries.
- `docs/architecture/quality/`: quality baseline, standards, validation,
  testing, security, reliability, and architecture audit vocabulary.
- `docs/architecture/index.md`: env vars, startup, reset, runtime commands,
  and rollout validation.
- `docs/adr/`: durable decisions. Current ADRs live here.
  Historical and superseded text is not the normal target-state read path.
- `SPEC.md`: why Originium should exist, who it serves, UX intent, design
  language, and user-visible behavior framing.
- `docs/agent/`: bead tracker mechanics and process-design references.
- `.agents/skills/`: task-specific agent procedures that should not be read by
  every agent.
- Beads: active work, sequencing, phase tags, handoff notes, and migration
  intent.

## Staleness Rules

- During active rewrites, docs and current ADRs describe the target design
  unless they are clearly stale, contradictory, or incomplete.
- When docs and code disagree, identify whether code is behind target design or
  docs are stale before editing.
- Do not leave two competing target states. Update, delete, or clearly mark
  superseded language.
- Historical ADRs may preserve old rationale, but current docs should not rely
  on historical text for target-state instructions.
- Migration notes may mention old names, but target-state docs should use
  current vocabulary.

## Update Rules

- Update architecture docs when ownership, package boundaries, contracts,
  runtime topology, security model, reliability model, or validation strategy
  changes.
- Update ADRs only for decisions that are hard to reverse, surprising without
  context, and the result of a real trade-off.
- Update `CONTEXT.md` when domain vocabulary changes or a term is being used
  inconsistently across docs, beads, and code.
- Update product docs when user-visible behavior, UX principles, or design
  language changes.
- Update agent docs or skills when process changes. Put role-specific procedure
  in `.agents/skills/`, general bead mechanics in `docs/agent/beads.md`, and
  agent-system principles in `docs/agent/constitution.md` when intentionally
  changing Originium's agent orchestration model.
- Update bead descriptions, acceptance criteria, or notes when docs work
  reveals tracker ambiguity that would mislead the next agent.
- Use `docs/architecture/quality/validation.md` for shared behavior
  validation standards. Use `validate-behavior` and `review-code` skill docs
  for role-specific procedure.
- Keep Beads-native `Acceptance Criteria` as the single executable contract for
  bead done-ness. Do not introduce a separate validation-proof section; fold
  validation proof into acceptance criteria when it defines done.

## Reconciliation Workflow

1. Identify the docs scope: domain, architecture, ADR, product, agent process,
   operations, or bead tracker.
2. Read the current authoritative docs for that scope before editing.
3. Search for stale terms and competing claims with `rg`.
4. Inspect code or beads only as needed to resolve whether docs or code are
   stale.
5. Edit the smallest set of docs that removes ambiguity.
6. If the work changes target design, update or create beads/decision records
   as appropriate.
7. Verify docs and targeted references.

Useful searches:

```bash
rg -n "<old-term>|<new-term>" docs CONTEXT.md AGENTS.md .agents
rg -n "<package-or-command>" docs package.json scripts .agents
```

## Verification

Use `docs/architecture/quality/validation.md` as the validation command router. For
docs-only changes, run focused docs checks. Run additional checks only when the
docs work also changes scripts, package entrypoints, file names, executable
behavior, or file-size-sensitive content.

If a check is not run because it is irrelevant or blocked by environment, say
so in the handoff.

## Handoff

Report:

- docs changed;
- stale terms or claims removed;
- target-state source of truth after the change;
- checks run;
- unresolved mismatches;
- follow-up bead IDs, if any.
