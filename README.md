# @eternasuno/better-auth-acebase

AceBase adapter for [better-auth](https://www.better-auth.com). This package lets
you use AceBase as the database for your better-auth instance.

## Install

```bash
pnpm add @eternasuno/better-auth-acebase acebase
```

## Usage

```ts
import { AceBase } from 'acebase';
import { acebaseAdapter } from '@eternasuno/better-auth-acebase';

const db = new AceBase('app', { storage: { path: './data' } });
await db.ready();

export const auth = betterAuth({
  database: acebaseAdapter({ db, usePlural: false }),
  // ... rest of better-auth config
});
```

## Config

| Option        | Type      | Default | Description                        |
|---------------|-----------|---------|------------------------------------|
| `db`          | `AceBase` | —       | The AceBase database instance      |
| `usePlural`   | `boolean` | `false` | Use plural table names             |
| `debugLogs`   | `boolean` | `false` | Enable adapter debug logs          |

## Development

```bash
pnpm install
pnpm build  # tsc -> dist/ (compiled ESM + types)
pnpm test   # runs better-auth adapter test suite
pnpm check      # tsc --noEmit + biome check
pnpm check:fix  # applies Biome fixes
```

## Known limitations

- **Null handling**: AceBase drops raw `null` values (and rejects arrays containing
  them), so the adapter encodes nulls as the sentinel string
  `__acebase_null__:v2:1fc8c21f5a3f015e455c7379d0c42e6c` on write and decodes them
  back on read. The random-looking suffix is fixed on purpose, so accidental
  collisions with real data are practically impossible. The encoding is deliberately
  idempotent:
  better-auth's factory applies `customTransformInput` to where-clause values
  unconditionally, and stacked adapter factories apply it again — so a value may be
  encoded more than once. That rules out collision-proof escaping schemes: a stored
  string exactly equal to the sentinel reads back as `null` (theoretical risk,
  accepted and documented).
- **Query strategy**: filters are translated into AceBase queries. Single OR-group
  queries push sorting and pagination down to AceBase, while counts use its native
  count operation. Multiple OR groups run as parallel queries over their complete
  matching sets, then merge, deduplicate, sort, and paginate in memory. Queries use
  an explicit `TAKE_ALL = Number.MAX_SAFE_INTEGER` where needed to avoid AceBase's
  implicit 100-row limit.
- **Case sensitivity**: indexes are created with `caseSensitive: true`, so
  `eq`/`in`/`not_in` behave case-sensitively by default; better-auth's insensitive
  mode is implemented via case-insensitive regex matches instead.
- **Join limits**: join results are capped by better-auth itself — the adapter
  factory always injects a numeric limit into every join config
  (`defaultFindManyLimit ?? 100`, or `1` for one-to-one), regardless of adapter behavior.

## License

MIT