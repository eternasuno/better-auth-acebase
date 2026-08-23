import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  authFlowTestSuite,
  caseInsensitiveTestSuite,
  normalTestSuite,
  testAdapter,
} from '@better-auth/test-utils/adapter';
import { AceBase } from 'acebase';
import type { BetterAuthOptions } from 'better-auth';
import { afterAll, describe, expect, it } from 'vitest';
import { acebaseAdapter } from '../src/adapter';
import { joinExplicitLimitTestSuite } from './join-limit';
import {
  nestedNullValuesRoundTripTestSuite,
  sentinelAmbiguityTestSuite,
} from './null-marker';
import {
  caseSensitivePatternOperatorsTestSuite,
  overlappingOrGroupsDeduplicationTestSuite,
  patternInsensitiveAndWildcardTestSuite,
  unfilteredCountTestSuite,
} from './query-regressions';

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
