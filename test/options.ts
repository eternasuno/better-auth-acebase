import type { BetterAuthOptions } from 'better-auth';

// Extra user fields used by the regression suites; declared through better-auth options so
// the factory maps and validates them like any column.
export const extendedUserModelOptions = {
  user: {
    additionalFields: {
      age: { type: 'number', required: false },
      profile: { type: 'json', required: false },
      tags: { type: 'string[]', required: false },
    },
  },
} satisfies BetterAuthOptions;
