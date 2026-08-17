# better-auth-acebase

AceBase adapter for [better-auth](https://www.better-auth.com). This package lets
you use AceBase as the database for your better-auth instance.

## Install

```bash
pnpm add better-auth-acebase acebase
```

## Usage

```ts
import { AceBase } from 'acebase';
import { acebaseAdapter } from 'better-auth-acebase';

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
pnpm test   # runs better-auth adapter test suite
pnpm check  # tsc --noEmit + biome check
```

## License

MIT