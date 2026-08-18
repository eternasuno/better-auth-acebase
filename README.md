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
pnpm check  # tsc --noEmit + biome check
```

## Publish

Tag a release with `v*` and the GitHub Actions workflow
`.github/workflows/publish.yml` builds the package and publishes it to npm via
[Trusted Publishing](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-cloud-providers)
(OIDC, no token secret needed). Configure the trusted publisher once on
npmjs.com for this package pointing at this repository and the `publish.yml`
workflow.

## License

MIT