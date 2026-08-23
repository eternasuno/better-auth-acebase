import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  authFlowTestSuite,
  caseInsensitiveTestSuite,
  createTestSuite,
  normalTestSuite,
  testAdapter,
} from '@better-auth/test-utils/adapter';
import { AceBase } from 'acebase';
import type { BetterAuthOptions } from 'better-auth';
import { afterAll, describe, expect, it } from 'vitest';
import { acebaseAdapter } from '../src/adapter';
import { fromNullMarker, NULL_MARKER, toNullMarker } from '../src/utils';

// Extra user fields used by the regression suites below; declared through
// better-auth options so the factory maps and validates them like any column.
const extendedUserModelOptions = {
  user: {
    additionalFields: {
      age: { type: 'number', required: false },
      profile: { type: 'json', required: false },
      tags: { type: 'string[]', required: false },
    },
  },
} satisfies BetterAuthOptions;

describe('AceBase Adapter', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'test-acebase-'));
  const db = new AceBase('test', { logLevel: 'error', storage: { path: tempDir } });
  await db.ready();

  const usePlural = false;
  const adapter = acebaseAdapter({ db, usePlural });

  const { execute } = await testAdapter({
    adapter: () => adapter,
    onFinish: async () => {
      await db.close();
      await rm(tempDir, { recursive: true });
    },
    runMigrations: async (options) => {
      await adapter(options).createSchema?.(options);
    },
    // Custom suites come last: their defaultBetterAuthOptions extend the shared
    // user model with extra fields, which must not affect the official suites.
    tests: [
      normalTestSuite(),
      authFlowTestSuite(),
      caseInsensitiveTestSuite(),
      unfilteredCountTestSuite(),
      caseSensitivePatternOperatorsTestSuite(),
      overlappingOrGroupsDeduplicationTestSuite(),
      nestedNullValuesRoundTripTestSuite(),
      joinExplicitLimitTestSuite(),
      sentinelAmbiguityTestSuite(),
    ],
  });

  execute();
});

// usePlural is resolved by better-auth's factory before the adapter sees the
// model: every 'user' operation must land under the pluralized 'users' path
// only. Runs standalone because testAdapter wires a single shared instance.
describe('AceBase Adapter usePlural mode', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'test-acebase-plural-'));
  const db = new AceBase('test-plural', {
    logLevel: 'error',
    storage: { path: tempDir },
  });
  await db.ready();

  const adapter = acebaseAdapter({ db, usePlural: true })({
    user: { modelName: 'user' },
  } as BetterAuthOptions);

  afterAll(async () => {
    await db.close();
    await rm(tempDir, { recursive: true });
  });

  it('create -> findOne -> update -> delete a user under users/<id>', async () => {
    const created = await adapter.create({
      model: 'user',
      data: {
        name: 'Plural User',
        email: 'plural@example.com',
        emailVerified: false,
      },
    });

    // Data lives under the plural path; the singular path stays untouched.
    expect(await db.ref(`users/${created.id}`).exists()).toBe(true);
    expect(await db.ref(`user/${created.id}`).exists()).toBe(false);

    const found = (await adapter.findOne({
      model: 'user',
      where: [{ field: 'id', value: created.id, operator: 'eq' }],
    })) as { email?: string } | null;
    expect(found?.email).toBe('plural@example.com');

    await adapter.update({
      model: 'user',
      where: [{ field: 'id', value: created.id }],
      update: { name: 'Renamed User' },
    });
    const renamed = (await adapter.findOne({
      model: 'user',
      where: [{ field: 'id', value: created.id, operator: 'eq' }],
    })) as { name?: string } | null;
    expect(renamed?.name).toBe('Renamed User');

    await adapter.delete({
      model: 'user',
      where: [{ field: 'id', value: created.id }],
    });
    expect(
      await adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: created.id, operator: 'eq' }],
      })
    ).toBeNull();
    expect(await db.ref(`users/${created.id}`).exists()).toBe(false);
  });
});

// Guards the native q.count() fast path: a filterless count must see every row
// even when the result set exceeds AceBase's implicit take of 100 and
// better-auth's defaultFindManyLimit of 100.
const unfilteredCountTestSuite = createTestSuite(
  'AceBase unfiltered count beyond default limit',
  {},
  ({ adapter, insertRandom }) => ({
    'count returns more than defaultFindManyLimit (100)': async () => {
      await insertRandom('user', 150);
      const count = await adapter.count({ model: 'user' });
      if (count !== 150) {
        throw new Error(`expected 150, got ${count}`);
      }
    },
  })
);

// Regression: AceBase's `like` operator always ignores case, so the sensitive
// contains / starts_with / ends_with handlers silently degraded to
// case-insensitive matching. They must use anchored regular expressions
// without the `i` flag instead.
const caseSensitivePatternOperatorsTestSuite = createTestSuite(
  'AceBase case-sensitive pattern operators',
  {},
  ({ adapter, generate, insertRandom }) => ({
    'contains with default mode does not match different case': async () => {
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'CaseSensitive' },
        forceAllowId: true,
      });
      await insertRandom('user', 3);

      const matches = await adapter.findMany({
        model: 'user',
        where: [{ field: 'name', value: 'casesensitive', operator: 'contains' }],
      });

      expect(matches).toHaveLength(0);
    },
    'starts_with with default mode does not match different case': async () => {
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'CaseSensitive' },
        forceAllowId: true,
      });
      await insertRandom('user', 3);

      const matches = await adapter.findMany({
        model: 'user',
        where: [{ field: 'name', value: 'casesens', operator: 'starts_with' }],
      });

      expect(matches).toHaveLength(0);
    },
    'ends_with with default mode does not match different case': async () => {
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'CaseSensitive' },
        forceAllowId: true,
      });
      await insertRandom('user', 3);

      const matches = await adapter.findMany({
        model: 'user',
        where: [{ field: 'name', value: 'sensitive', operator: 'ends_with' }],
      });

      expect(matches).toHaveLength(0);
    },
    'contains with insensitive mode matches ignoring case': async () => {
      const created = await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'CaseSensitive' },
        forceAllowId: true,
      });
      await insertRandom('user', 3);

      const matches = (await adapter.findMany({
        model: 'user',
        where: [
          { field: 'name', value: 'casesensitive', operator: 'contains', mode: 'insensitive' },
        ],
      })) as Array<{ id: string }>;

      expect(matches.map((row) => row.id)).toEqual([created.id]);
    },
    'contains matches wildcard characters literally': async () => {
      const created = await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'star*light' },
        forceAllowId: true,
      });
      await insertRandom('user', 3);

      const matches = (await adapter.findMany({
        model: 'user',
        where: [{ field: 'name', value: 'star*light', operator: 'contains' }],
      })) as Array<{ id: string }>;

      expect(matches.map((row) => row.id)).toEqual([created.id]);
    },
  })
);

// Regression: OR clauses run as one query per group; a row matching several
// groups used to be duplicated in findMany results and double-counted in count.
const overlappingOrGroupsDeduplicationTestSuite = createTestSuite(
  'AceBase overlapping OR groups are deduplicated',
  { defaultBetterAuthOptions: extendedUserModelOptions },
  ({ adapter, generate }) => ({
    'findMany returns a row matching several groups only once': async () => {
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'Overlap', age: 30 },
        forceAllowId: true,
      });
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'SecondGroupOnly', age: 40 },
        forceAllowId: true,
      });
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'NoMatch', age: 20 },
        forceAllowId: true,
      });

      const rows = (await adapter.findMany({
        model: 'user',
        where: [
          { field: 'name', value: 'Overlap', operator: 'eq' },
          { field: 'age', value: 35, operator: 'gte', connector: 'OR' },
        ],
      })) as Array<{ name?: string }>;

      expect(rows.map((row) => row.name).sort()).toEqual(['Overlap', 'SecondGroupOnly']);
    },
    'count counts a row matching several groups only once': async () => {
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'Overlap', age: 30 },
        forceAllowId: true,
      });
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'NoMatch', age: 20 },
        forceAllowId: true,
      });

      const total = await adapter.count({
        model: 'user',
        where: [
          { field: 'name', value: 'Overlap', operator: 'eq' },
          { field: 'age', value: 25, operator: 'gte', connector: 'OR' },
        ],
      });

      expect(total).toBe(1);
    },
  })
);

// Regression: AceBase drops null values and rejects arrays containing them.
// The adapter encodes nulls as a sentinel string on write and decodes them on
// read; that encoding must reach values nested inside json fields and arrays,
// not just top-level columns.
const nestedNullValuesRoundTripTestSuite = createTestSuite(
  'AceBase nested null values survive a round trip',
  { defaultBetterAuthOptions: extendedUserModelOptions },
  ({ adapter, generate }) => ({
    'create keeps nulls nested inside json fields and arrays': async () => {
      const created = await adapter.create({
        model: 'user',
        data: {
          ...(await generate('user')),
          profile: { bio: null, level: 3 },
          tags: ['admin', null],
        },
        forceAllowId: true,
      });

      const found = (await adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: created.id, operator: 'eq' }],
      })) as ({ profile?: unknown; tags?: unknown } & Record<string, unknown>) | null;

      expect(found?.profile).toEqual({ bio: null, level: 3 });
      expect(found?.tags).toEqual(['admin', null]);
    },
    'update keeps nulls nested inside json fields and arrays': async () => {
      const created = await adapter.create({
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
        update: { profile: { bio: null, level: 2 }, tags: [null] },
      });

      const found = (await adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: created.id, operator: 'eq' }],
      })) as ({ profile?: unknown; tags?: unknown } & Record<string, unknown>) | null;

      expect(found?.profile).toEqual({ bio: null, level: 2 });
      expect(found?.tags).toEqual([null]);
    },
  })
);

// Unit-level pin on the null-marker encoding. The mapping is intentionally NOT collision-free:
// it must be idempotent because better-auth's factory may apply customTransformInput to the
// same value more than once (stacked factories re-transform where clauses), and idempotence
// plus a total decode makes any escaping scheme impossible. Round trips therefore preserve
// every value EXCEPT strings exactly equal to the sentinel, which read back as null.
describe('null marker encoding', () => {
  const roundTrip = (value: unknown) => fromNullMarker(toNullMarker(value));

  it('is idempotent in both directions', () => {
    const inputs = [
      null,
      NULL_MARKER,
      `${NULL_MARKER}x`,
      '',
      'plain',
      3,
      [NULL_MARKER, null],
      { a: { b: null }, c: NULL_MARKER, d: [{ e: null }] },
    ];
    for (const input of inputs) {
      expect(toNullMarker(toNullMarker(input))).toEqual(toNullMarker(input));
      expect(fromNullMarker(fromNullMarker(input))).toEqual(fromNullMarker(input));
    }
  });

  it('round trips every value except the literal sentinel', () => {
    const lossless = [
      `${NULL_MARKER}x`,
      '',
      'plain',
      3,
      [`${NULL_MARKER}x`, null],
      { a: { b: null } },
    ];
    for (const input of lossless) {
      expect(roundTrip(input)).toEqual(input);
    }

    expect(roundTrip(null)).toBeNull();
    expect(roundTrip(NULL_MARKER)).toBeNull();
  });
});

// Documents the accepted trade-off of the sentinel scheme: the encoding must be idempotent
// (better-auth's transform pipeline can encode the same value twice), which makes a stored
// string exactly equal to NULL_MARKER indistinguishable from an encoded null — on writes,
// reads, and queries alike.
const sentinelAmbiguityTestSuite = createTestSuite(
  'AceBase null-marker ambiguity is documented behavior',
  {},
  ({ adapter, generate }) => ({
    'a stored literal sentinel string reads back as null': async () => {
      const created = await adapter.create({
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
      const created = await adapter.create({
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

// better-auth's adapter factory injects a numeric limit into every join config
// (defaultFindManyLimit ?? 100; 1 for one-to-one), so an unset limit can never
// be observed from adapter code. What the adapter controls is honoring the
// limit it *is* given: verify an explicitly raised join limit is passed through
// to AceBase's take() and that all matching children reach the merged result.
const joinExplicitLimitTestSuite = createTestSuite(
  'AceBase join honors an explicit join limit',
  {},
  ({ adapter, generate }) => ({
    'findMany join returns every child row up to the explicit join limit': async () => {
      const parent = await adapter.create({
        model: 'user',
        data: await generate('user'),
        forceAllowId: true,
      });
      for (let i = 0; i < 105; i++) {
        await adapter.create({
          model: 'session',
          data: { ...(await generate('session')), userId: parent.id },
          forceAllowId: true,
        });
      }

      const rows = (await adapter.findMany({
        model: 'user',
        where: [{ field: 'id', value: parent.id, operator: 'eq' }],
        join: { session: { limit: 105 } },
      })) as Array<{ session?: unknown[] }>;

      expect(rows).toHaveLength(1);
      expect(rows[0]?.session).toHaveLength(105);
    },
  })
);
