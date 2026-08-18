# AGENTS.md

## What this is

AceBase adapter for better-auth. Single small TS library, no monorepo, no framework.

## Git workflow

`main` is branch-protected: direct pushes (including admins) are rejected — all changes go through a PR (`git push` a feature branch, then `gh pr create`). Tags are unaffected and drive the npm publish workflow.

## Build step

The package compiles to `dist/` via `pnpm build` (`tsc -p tsconfig.build.json`). Development config is the plain `tsconfig.json` (covers `src/` + `test/`, `noEmit` — this is what VSCode's TS server picks up, one project for all files); `tsconfig.build.json` extends it with emit settings (`rootDir: "src"`, `outDir: "dist"`, declarations) and includes only `src/`, so output lands directly in `dist/` (no `dist/src/`, no test artifacts). Key detail: source uses `.ts` extension on relative imports (`./query.ts`), and `rewriteRelativeImportExtensions` rewrites them to `.js` in the output — required for Node ESM to resolve. `tsconfig.json` sets `allowImportingTsExtensions` for this.

Published artifacts: `exports`/`types`/`files` all point at `dist/` (`./dist/adapter.js` + `.d.ts`). Tests run against raw TS via vitest, so `pnpm test`/`pnpm check` never touch `dist` — run `pnpm build` to verify emit. Publishing happens through `.github/workflows/publish.yml` (tag `v*` → build + test + publish to npm via Trusted Publishing / OIDC, `id-token: write` permission; no token secret).

## Commands

- `pnpm build` — `tsc -p tsconfig.build.json` → `dist/` (compiled ESM + `.d.ts`; `dist/` gitignored). Run it after changing source; the CI publish workflow runs it too.
- `pnpm check` — `tsc --noEmit && biome check --write`. The first tsc typechecks both `src/` and `test/` (vitest transpiles but never typechecks) via the single dev `tsconfig.json`. **Note: `--write` auto-fixes files**, so running it may modify the working tree (it re-formats in place). Run it after changes; it passed clean with 0 fixes when last verified.
- `pnpm test` — `vitest run`. Runs the full better-auth adapter suite (110 tests, ~12s) against a **real AceBase instance** created in a temp dir (`test/adapter.test.ts` via `mkdtemp` + in-memory file storage). Integration-level, not mocked. Includes a local `countRegressionSuite` (count > `defaultFindManyLimit` 100).

Style is enforced by biome (single quotes, semicolons always, 2-space indent, line width 98). `noExplicitAny` is enabled (repo default) — the adapter methods are typed with generics (`<T = Value>`), not `any`.

All comments and log messages must be written in English.

## Architecture / file ownership

Entry point: `src/adapter.ts` exports `acebaseAdapter(config)`; config sets adapter capabilities (`supportsDates: false`, `supportsArrays: true`, `supportsJSON: true`, `supportsNumericIds: false`, `supportsUUIDs: false`, `transaction: false`, `usePlural`, `debugLogs`). The `customTransformInput`/`customTransformOutput` hooks there do the null-marker encoding (see Gotchas).

- `src/where.ts` — translates better-auth operators into AceBase query filters. OR-clauses are split into separate queries; comparisons are `>`/`>=`/`<`/`<=`/`in`/`!in`/`==`/`!=`, strings use `like`/`matches` (regex, case-sensitivity handled by `insensitive*` handlers).
- `src/query.ts` — `findMany`/`findOne`/`count`. Runs all OR-group queries in parallel, then **merges, sorts, slices, joins, and selects in memory**. `count` uses AceBase's native `q.count()` (enumerates refs, no data load), summed across OR groups.
- `src/write.ts` — `create`/`update`/`updateMany`/`remove`/`removeMany`/`createSchema`. `createSchema` creates indexes for schema fields marked `index`/`unique`; failures propagate (AceBase's `indexes.create` is idempotent for existing indexes, so hard-failing is safe).
- `src/join.ts` — relation joins (`one-to-one` vs one-to-many), merges by foreign key.
- `src/utils.ts` — shared post-processing: sort/slice/select (`applySlice` has no default limit — `undefined` means no slicing), plus null-marker helpers (`toNullMarker`/`fromNullMarker`).

## Gotchas

- **AceBase drops `null` values** (verified: `set({a: null, ...})` reads back without the key), so `null` is encoded as the sentinel string `'__acebase_null__'` via better-auth's `customTransformInput`/`customTransformOutput` hooks in `src/adapter.ts`. The factory applies them to every field on writes, reads, where-clauses, and joins — never write raw `null` into records.
- **Queries use `take(TAKE_ALL)` where `TAKE_ALL = Number.MAX_SAFE_INTEGER`** (`src/where.ts`), then slice/paginate in memory. The constant is mandatory, not cosmetic: AceBase's filterless queries default to `take: 100` when no take is given, so without it every unfiltered query would silently return 100 rows.
- `supportsDates: false` is **required**, not a nice-to-have: verified that AceBase's query engine `==` filter never matches `Date` values (its `>`/`>=` range filters do work, but `==` returns 0 hits even for identical timestamps). So dates must stay as ISO strings via better-auth — flipping `supportsDates` to `true` breaks `findOne`/`where eq` on date fields (test: `findOne - should find model with date field`).
