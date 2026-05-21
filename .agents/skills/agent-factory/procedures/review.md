# Review

Use this subskill for independent code review. Code review starts from the diff and
judges whether the change is well-built. It is not scenario validation.

## Sources

Read the changed files and relevant:

- the mapped agent instructions;
- the mapped quality index;
- the mapped code standards when code policy matters;
- the mapped validation router when test or validation coverage is part of the
  review;
- docs, ADRs, bead acceptance criteria, and expected migration breakage for the
  changed area.

## Review Stance

Reviewers are read-only by default. Do not edit files unless explicitly asked.

Lead with findings ordered by severity. Focus on:

- behavioral bugs introduced by the change;
- architecture or ownership regressions;
- missing or misleading tests;
- security, data loss, persistence, concurrency, or lifecycle risk;
- compatibility shims, deprecated wrappers, or legacy paths;
- docs/code disagreement;
- validation claims unsupported by evidence.

If no issues are found, say that clearly and mention residual risk or unrun
checks.

## Evidence

Findings cite concrete files and lines when possible. Explain why the
issue matters and what to change. Do not bury findings under a long summary.

Use this output shape:

```text
Findings
- Severity: file:line - issue, impact, recommendation.

Open Questions
- ...

Residual Risk
- ...
```

Reviewers may recommend validation, but they do not close product validation
unless separately assigned the `validate` subskill.
