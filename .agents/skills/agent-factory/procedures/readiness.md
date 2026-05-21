# Readiness

Use this subskill to assess whether a repository is legible and operable by
agents. It evaluates the environment, not the code quality.

This is a human-driven subskill. Report conversationally. Do not check in a
report file unless the user asks for one.

## When to Use

- Before onboarding agents to a new or unfamiliar repository.
- When agents repeatedly struggle to find context, run checks, or hand off work.
- When the repository has drifted and you suspect the binding or docs are stale.
- After `install` to verify the scaffolded repository is actually agent-ready.

## When Not to Use

- Do not use `readiness` for architecture quality findings; use `audit`.
- Do not use `readiness` for code review; use `review`.
- Do not use `readiness` for behavior validation; use `validate`.
- Do not evaluate CI/CD pipelines, PR workflows, or observability systems.
  These are out of scope until the agent-factory defines how it wants to work
  with those systems.

## Procedure

1. Load [repo-shape.md](../standards/repo-shape.md) and `AGENTFACTORY.md` (if it exists).
2. Inspect the repository file structure against the intended shape.
3. For each file, verify it matches the _intent_ described in `repo-shape.md`,
   not just existence. Use the quality heuristics and anti-patterns as a guide.
4. Check basic hygiene (gitignore, secrets, CODEOWNERS).
5. Skip any criterion that does not apply to the repository type.
6. Report findings conversationally.

## Categories

### Agent Entry

Criteria for how easily a fresh agent can enter the repository.

- `AGENTS.md` exists and is ≤150 lines.
- `AGENTS.md` names the tracker and points to `AGENTFACTORY.md`.
- `AGENTS.md` does not duplicate subskill procedure.
- `docs/index.md` exists and routes to durable sources.

### Context and Decisions

Criteria for domain language and durable decision records.

- `CONTEXT.md` exists and defines concrete domain terms.
- `CONTEXT.md` records real ambiguity decisions.
- `docs/adr/` exists.
- ADRs explain trade-offs, not just state choices.
- Superseded ADRs are marked, not deleted.
- Archive hygiene: current docs do not rely on historical ADRs for target-state
  instructions.

### Intent and Scope

Criteria for product clarity and work tracking.

- `SPEC.md` exists with named users and clear purpose.
- `SPEC.md` lists concrete, observable target behaviors.
- Beads tracker is initialized and syncable.
- `AGENTFACTORY.md` names a tracker backup/export path.

### Validation and Quality

Criteria for proving work and maintaining standards.

- `docs/architecture/quality/validation.md` exists.
- Validation router maps checks to runnable commands.
- At least one validation gate is runnable and documented.
- `docs/architecture/quality/architecture-quality.md` exists with concrete
  repository nouns.
- `docs/architecture/quality/standards.md` exists.

### Build and Test

Criteria for mechanical correctness.

- Build commands are documented.
- Tests are runnable and follow naming conventions.
- A single-command setup path exists for local development.

### Documentation

Criteria for docs freshness and structural health.

- `docs/architecture/index.md` exists with ownership and boundaries.
- `docs/architecture/quality/index.md` exists.
- No competing target states: docs and code agree on the target design.
- Docs map is up to date with all primary sources.

### Agent Process

Criteria for agent-factory binding quality.

- `AGENTFACTORY.md` exists.
- Every source in `AGENTFACTORY.md` points to an existing file.
- Every check in `AGENTFACTORY.md` is runnable.
- Product-specific skills are listed and loadable.
- Subskills are discoverable from the binding or docs.

### Basic Hygiene

Criteria for repository safety and ownership.

- `.gitignore` excludes build artifacts, editor files, and local secrets.
- No committed secrets or credentials.
- If multi-owner, CODEOWNERS or equivalent exists.

## Scoring

For each criterion, report:

- **pass**: the criterion is met with evidence.
- **fail**: the criterion is not met. Include concrete evidence (missing file,
  empty section, broken command).
- **skip**: the criterion does not apply to this repository type.

Report a category score (e.g., "Agent Entry: 3/4") and an overall score.

## Report Format

Report conversationally with this structure:

1. **Overall score**: X/Y criteria passing.
2. **Strengths**: categories at 100% with brief evidence.
3. **Opportunities**: categories with gaps, each gap named with evidence.
4. **Recommendations**: what to fix first and which subskill owns the fix
   (`install`, `docs`, `plan`, etc.).

If the user asks to record findings, use the `plan` subskill conventions:

- Create problem beads when the gap is clear and fixable.
- Create spike beads when the solution space is unclear.
- Create decision beads when a durable repo-shape choice is needed.

## Handoff

Report:

- overall score and category breakdown;
- concrete gaps with evidence;
- recommendations and which subskill should own each fix;
- follow-up bead IDs if findings were recorded.
