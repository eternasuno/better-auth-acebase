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
import { describe } from 'vitest';
import { acebaseAdapter } from '../src/adapter';
import { joinExplicitLimitTestSuite } from './join-limit';
import {
  nestedNullValuesRoundTripTestSuite,
  sentinelAmbiguityTestSuite,
} from './null-marker';
import {
  caseSensitivePatternOperatorsTestSuite,
  findManyLimitZeroTestSuite,
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

  const adapter = acebaseAdapter({ db, usePlural: true });

  const { execute } = await testAdapter({
    adapter: () => adapter,
    onFinish: async () => {
      await db.close();
      await rm(tempDir, { recursive: true });
    },
    runMigrations: async (options) => {
      await adapter(options).createSchema?.(options);
    },
    // Custom suites come last: their shared options must not affect the official suites.
    tests: [
      normalTestSuite(),
      authFlowTestSuite(),
      caseInsensitiveTestSuite(),
      unfilteredCountTestSuite(),
      caseSensitivePatternOperatorsTestSuite(),
      patternInsensitiveAndWildcardTestSuite(),
      overlappingOrGroupsDeduplicationTestSuite(),
      findManyLimitZeroTestSuite(),
      nestedNullValuesRoundTripTestSuite(),
      joinExplicitLimitTestSuite(),
      sentinelAmbiguityTestSuite(),
    ],
  });

  execute();
});
