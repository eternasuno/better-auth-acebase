---
name: designing-contract-database-adapters
description: Use when changing this project's adapter operations, query semantics, value transforms, naming, uniqueness, joins, or conformance tests.
---

# Designing Contract Database Adapters

## Overview

Treat the adapter as a semantic compiler: Better Auth defines observable behavior; AceBase is the execution engine. AceBase defaults must not redefine the adapter contract.

## Workflow

1. Establish authorities: Better Auth contracts and capability flags define behavior, schema metadata defines names and constraints, normalized runtime input defines guaranteed values, and AceBase types define API shapes.
2. Trace every factory transform, model/field mapping, and injected default before changing an operator.
3. Write the operation order explicitly before implementation.
4. Keep AceBase gaps behind shared operators and transforms.
5. Run Better Auth suites before custom regressions.

## Required Pipelines

A single query may push filtering, sorting, offset, and limit to AceBase only when semantics remain exact.

Multiple OR groups use:

```text
fetch every group completely with TAKE_ALL
→ deduplicate by reference path
→ globally sort
→ globally slice
→ join
→ select
```

Count and bulk mutations use the same complete, deduplicated target set. Never paginate OR branches independently.

## Boundaries

- Derive adapter types from Better Auth contracts and storage values/references from AceBase APIs.
- Bind `db` and `creatorConfig` first; keep model, where, pagination, join, select, and update in the operation object.
- Keep the null-marker transform idempotent and symmetric across writes, reads, predicates, uniqueness, and joins.
- Distinguish schema key, configured model name, pluralized physical model, logical field, and stored field. Uniqueness queries must target the same physical collection as writes.
- Override AceBase's implicit 100-row cap on every logically unbounded path. Preserve explicit zero limits.
- Treat join limits as per-parent values and use Better Auth's runtime-injected numeric limit directly.
- Keep capability declarations aligned with implementation; do not emulate unsupported nested object/array behavior.

## Regression Matrix

| Risk | Regression |
|---|---|
| Implicit cap | Exceed 100; read/count/update/delete all |
| Overlapping OR | Return/effect/count one matching row once |
| Global OR order | Best rows lie deep in separate groups |
| Stacked transforms | Exercise the full factory path |
| Name normalization | `usePlural: true`; composite uniqueness on create/update |
| Join limit | Raised, per-parent, and zero limits |

Use a real temporary AceBase database. Custom suites that modify shared options belong after official suites.