import { createTestSuite } from '@better-auth/test-utils/adapter';
import { expect } from 'vitest';
import { NULL_MARKER } from '../src/utils';
import { extendedUserModelOptions } from './options';

const PROFILE_LEVEL_CREATED = 3;
const PROFILE_LEVEL_UPDATED = 2;
const CREATED_PROFILE = {
  bio: null,
  level: PROFILE_LEVEL_CREATED,
  marker: NULL_MARKER,
};

// better-auth serializes JSON fields and arrays, so nested nulls reach AceBase inside strings.
export const nestedNullValuesRoundTripTestSuite = createTestSuite(
  'AceBase nested null values survive a round trip',
  { defaultBetterAuthOptions: extendedUserModelOptions },
  ({ adapter, generate }) => ({
    'create keeps nulls nested inside json fields and arrays': async () => {
      const created = await adapter.create<{ id: string }>({
        model: 'user',
        data: {
          ...(await generate('user')),
          profile: CREATED_PROFILE,
          tags: ['admin', null, NULL_MARKER],
        },
        forceAllowId: true,
      });

      const found = (await adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: created.id, operator: 'eq' }],
      })) as
        | ({ profile?: unknown; tags?: unknown } & Record<string, unknown>)
        | null;

      expect(found?.profile).toEqual(CREATED_PROFILE);
      expect(found?.tags).toEqual(['admin', null, NULL_MARKER]);
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

      const nulls = (await adapter.findMany({
        model: 'user',
        where: [{ field: 'name', value: null, operator: 'eq' }],
      })) as Array<{ id: string }>;

      expect(nulls.map((row) => row.id)).toContain(created.id);
    },
  })
);
