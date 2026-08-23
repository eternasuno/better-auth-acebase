import { createTestSuite } from '@better-auth/test-utils/adapter';
import { expect } from 'vitest';

const JOIN_LIMIT = 105;

// better-auth's adapter factory injects a numeric limit into every join config
// (defaultFindManyLimit ?? 100; 1 for one-to-one), so an unset limit can never
// be observed from adapter code. What the adapter controls is honoring the
// limit it *is* given: verify an explicitly raised join limit is passed through
// to AceBase's take() and that all matching children reach the merged result.
export const joinExplicitLimitTestSuite = createTestSuite(
  'AceBase join honors an explicit join limit',
  {},
  ({ adapter, generate }) => ({
    'findMany join returns every child row up to the explicit join limit':
      async () => {
        const parent = await adapter.create<{ id: string }>({
          model: 'user',
          data: await generate('user'),
          forceAllowId: true,
        });
        for (let i = 0; i < JOIN_LIMIT; i++) {
          await adapter.create({
            model: 'session',
            data: { ...(await generate('session')), userId: parent.id },
            forceAllowId: true,
          });
        }

        const rows = (await adapter.findMany({
          model: 'user',
          where: [{ field: 'id', value: parent.id, operator: 'eq' }],
          join: { session: { limit: JOIN_LIMIT } },
        })) as Array<{ session?: unknown[] }>;

        expect(rows).toHaveLength(1);
        expect(rows[0]?.session).toHaveLength(JOIN_LIMIT);
      },
  })
);
