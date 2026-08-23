import { createTestSuite } from '@better-auth/test-utils/adapter';
import { expect } from 'vitest';
import { NULL_MARKER } from '../src/utils';
import { extendedUserModelOptions } from './options';

const PROFILE_LEVEL_CREATED = 3;
const PROFILE_LEVEL_UPDATED = 2;

// Regression: AceBase drops null values and rejects arrays containing them.
// The adapter encodes nulls as a sentinel string on write and decodes them on
// read; that encoding must reach values nested inside json fields and arrays,
// not just top-level columns.
export const nestedNullValuesRoundTripTestSuite = createTestSuite(
  'AceBase nested null values survive a round trip',
  { defaultBetterAuthOptions: extendedUserModelOptions },
  ({ adapter, generate }) => ({
    'create keeps nulls nested inside json fields and arrays': async () => {
      const created = await adapter.create<{ id: string }>({
        model: 'user',
        data: {
          ...(await generate('user')),
          profile: { bio: null, level: PROFILE_LEVEL_CREATED },
          tags: ['admin', null],
        },
        forceAllowId: true,
      });

      const found = (await adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: created.id, operator: 'eq' }],
      })) as
        | ({ profile?: unknown; tags?: unknown } & Record<string, unknown>)
        | null;

      expect(found?.profile).toEqual({
        bio: null,
        level: PROFILE_LEVEL_CREATED,
      });
      expect(found?.tags).toEqual(['admin', null]);
    },
    'update keeps nulls nested inside json fields and arrays': async () => {
      const created = await adapter.create<{ id: string }>({
        model: 'user',
        data: {
          ...(await generate('user')),
          profile: { bio: 'hello', level: 1 },
          tags: ['admin'],
        },
        forceAllowId: true,
      });

      await adapter.update({
        model: 'user',
        where: [{ field: 'id', value: created.id, operator: 'eq' }],
        update: {
          profile: { bio: null, level: PROFILE_LEVEL_UPDATED },
          tags: [null],
        },
      });

      const found = (await adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: created.id, operator: 'eq' }],
      })) as
        | ({ profile?: unknown; tags?: unknown } & Record<string, unknown>)
        | null;

      expect(found?.profile).toEqual({
        bio: null,
        level: PROFILE_LEVEL_UPDATED,
      });
      expect(found?.tags).toEqual([null]);
    },
  })
);

// Documents the accepted trade-off of the sentinel scheme: the encoding must be idempotent
// (better-auth's transform pipeline can encode the same value twice), which makes a stored
// string exactly equal to NULL_MARKER indistinguishable from an encoded null — on writes,
// reads, and queries alike.
export const sentinelAmbiguityTestSuite = createTestSuite(
  'AceBase null-marker ambiguity is documented behavior',
  {},
  ({ adapter, generate }) => ({
    'a stored literal sentinel string reads back as null': async () => {
      const created = await adapter.create<{ id: string }>({
        model: 'user',
        data: { ...(await generate('user')), name: NULL_MARKER },
        forceAllowId: true,
      });

      const found = (await adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: created.id, operator: 'eq' }],
      })) as { name?: string | null } | null;

      expect(found?.name).toBeNull();
    },
    'eq null matches rows holding the literal sentinel string': async () => {
      const created = await adapter.create<{ id: string }>({
        model: 'user',
        data: { ...(await generate('user')), name: NULL_MARKER },
        forceAllowId: true,
      });

      // The row stores the sentinel string, which is exactly what an encoded null
      // looks like — so querying for null finds it too. Indistinguishable by design.
      const nulls = (await adapter.findMany({
        model: 'user',
        where: [{ field: 'name', value: null, operator: 'eq' }],
      })) as Array<{ id: string }>;

      expect(nulls.map((row) => row.id)).toContain(created.id);
    },
  })
);
