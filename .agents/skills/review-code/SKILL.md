---
name: review-code
description: Use for adversarial diff, code, design, architecture, security, migration, or test-quality review. Starts from the change and reports findings by severity with file/line evidence.
---

# Review Code

Use this skill for independent code review. This is not validation.
Code review asks whether the change is well-built; validation asks
whether the intended scenario works.

Authoritative sources:

1. `AGENTS.md`
2. `docs/architecture/quality/index.md`
3. `docs/architecture/quality/standards.md` when code policy matters
4. `docs/architecture/quality/validation.md` when test or validation
   coverage is part of the review
5. relevant docs, ADRs, bead acceptance criteria, and expected migration
   breakage

## Review Stance

Reviewers are read-only by default. Do not edit files unless explicitly asked.

Lead with findings ordered by severity. Focus on:

- behavioral bugs introduced by the change;
- architecture or ownership regressions;
- missing or misleading tests;
- security, data loss, persistence, concurrency, or lifecycle risk;
- compatibility shims or legacy paths forbidden by Originium policy;
- docs/code disagreement;
- validation claims that are not supported by evidence.

If no issues are found, say that clearly and mention residual risk or unrun
checks.

## Evidence

Findings should cite concrete files and lines when possible. Explain why the
issue matters and what should change. Do not bury findings under a long summary.

Reviewer output shape:

```text
Findings
- Severity: file:line - issue, impact, recommendation.

Open Questions
- ...

Residual Risk
- ...
```

Reviewers may recommend validation, but they do not close product
validation unless separately assigned a `validate-behavior` task.
