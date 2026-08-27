import type { BetterAuthOptions } from 'better-auth';

export const extendedUserModelOptions = {
  user: {
    additionalFields: {
      age: { type: 'number', required: false },
      profile: { type: 'json', required: false },
      tags: { type: 'string[]', required: false },
    },
  },
} satisfies BetterAuthOptions;
