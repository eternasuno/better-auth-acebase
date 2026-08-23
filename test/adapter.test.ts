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
import type { CleanedWhere } from 'better-auth/adapters';
import { afterAll, describe, expect, it } from 'vitest';
import { acebaseAdapter } from '../src/adapter';
import { joinExplicitLimitTestSuite } from './join-limit';
import {
  nestedNullValuesRoundTripTestSuite,
  sentinelAmbiguityTestSuite,
} from './null-marker';
import { extendedUserModelOptions } from './options';
import {
  caseSensitivePatternOperatorsTestSuite,
  findManyLimitZeroTestSuite,
  overlappingOrGroupsDeduplicationTestSuite,
  patternInsensitiveAndWildcardTestSuite,
  unfilteredCountTestSuite,
} from './query-regressions';

const PARITY_NAMES = [
  'SortMissingOne',
  'SortMissingTwo',
  'SortNumber',
  'SortStringOne',
  'SortStringTwo',
] as const;
const parityWhere = (multi: boolean): CleanedWhere[] => {
  const names = multi ? [...PARITY_NAMES].reverse() : PARITY_NAMES;

  return names
    .map<CleanedWhere>((value, index) => ({
      field: 'name',
      operator: multi ? 'eq' : 'in',
      value: multi ? value : [...PARITY_NAMES],
      connector: multi && index > 0 ? 'OR' : 'AND',
      mode: 'sensitive',
    }))
    .slice(0, multi ? PARITY_NAMES.length : 1);
};

type ParityHelpers = Parameters<Parameters<typeof createTestSuite>[2]>[0];
const seedParityRows = ({ adapter, generate }: ParityHelpers) =>
  Promise.all(
    PARITY_NAMES.map(async (name, index) =>
      adapter.create({
        model: 'user',
        data: {
          ...(await generate('user')),
          id: `parity-${index}`,
          name,
          profile:
            index < 2
              ? undefined
              : {
                  rank: index === 2 ? 2 : '2',
                  list: [index === 2 ? 2 : '2'],
                },
        },
        forceAllowId: true,
      })
    )
  );
const parityTests = (helpers: ParityHelpers) => ({
  'matches native sorting and in-memory sorting across windows': async () => {
    await seedParityRows(helpers);
    const find = (
      field: string,
      direction: 'asc' | 'desc',
      multi: boolean,
      window?: { offset: number; limit: number }
    ) =>
      helpers.adapter.findMany<{ name: string } & Record<string, unknown>>({
        model: 'user',
        sortBy: { field, direction },
        where: parityWhere(multi),
        ...window,
      });

    for (const field of [
      'profile/rank',
      'profile/list[0]',
      'profile/missing',
    ]) {
      for (const direction of ['asc', 'desc'] as const) {
        const native = await find(field, direction, false);
        const merged = await find(field, direction, true);
        expect(merged).toEqual(native);
        expect(
          await find(field, direction, true, { offset: 1, limit: 1 })
        ).toEqual(native.slice(1, 2));
        expect(
          (native as Array<Record<string, unknown>>).every(
            (row) => !('path' in row) && !('value' in row)
          )
        ).toBe(true);
      }
    }
  },
});
const orMergeOrderParityTestSuite = createTestSuite(
  'AceBase multi-group merge matches native ordering',
  { defaultBetterAuthOptions: extendedUserModelOptions },
  parityTests
);

describe('AceBase Adapter', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'test-acebase-'));
  const db = new AceBase('test', {
    logLevel: 'error',
    storage: { path: tempDir },
  });
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
      patternInsensitiveAndWildcardTestSuite(),
      overlappingOrGroupsDeduplicationTestSuite(),
      findManyLimitZeroTestSuite(),
      orMergeOrderParityTestSuite(),
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
    const created = await adapter.create<{ id: string }>({
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
