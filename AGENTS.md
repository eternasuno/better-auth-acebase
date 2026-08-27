# AGENTS.md

## Scope

AceBase adapter for better-auth. Single TypeScript library; no monorepo or
framework.

## Workflow

- `main` is branch-protected. Work on a feature branch and open a PR. Version
  tags drive npm publishing.
- For source changes, run `pnpm check`, `pnpm test`, and `pnpm build`. Tests use
  raw TypeScript and do not verify emitted `dist` files.
- Keep Vitest scoped to `test/`; otherwise it may scan ignored reference clones
  under `.slim/`.
- Tests use a real temporary AceBase database, not mocks.
- Register custom adapter suites after the official harness suites; their shared
  options would otherwise leak into official suites.

## Conventions

- Biome and TypeScript configuration are authoritative. Fix violations without
  relaxing their rules or limits.
- Write comments and log messages in English.
- For TypeScript implementation or review, load `writing-lean-typescript`.

## Adapter invariants

- AceBase drops `null`. Every write, read, where clause, and join must use the
  shared null-marker transforms. Encoding stays idempotent because stacked
  better-auth factories may transform values repeatedly. The exact sentinel
  lives only in `src/utils.ts`; a matching user string intentionally decodes as
  `null`.
- An AceBase query without filters or an explicit take defaults to 100 rows.
  Use the shared `TAKE_ALL` for unbounded paths.
- Multiple OR groups require complete group results and global ID deduplication
  before sorting, slicing, joining, selecting, or counting.
- better-auth injects a numeric join limit at runtime. Use it directly; the
  public optional type does not justify a fallback.
- AceBase indexes remain `caseSensitive: true`. Insensitive matching belongs in
  query translation; changing index sensitivity breaks sensitive equality and
  membership filters.
- Keep `supportsDates: false`: AceBase equality does not reliably match `Date`
  values, so better-auth must store ISO strings.
