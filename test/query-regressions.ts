import { createTestSuite } from '@better-auth/test-utils/adapter';
import type { CleanedWhere } from 'better-auth/adapters';
import { expect } from 'vitest';
import { extendedUserModelOptions } from './options';

const COUNT_TARGET = 150;
const RANDOM_FILL_ROWS = 3;
const SENSITIVE_NAME = 'CaseSensitive';
const LOWERCASE_NAME = 'casesensitive';
const SENSITIVE_PREFIX = 'casesens';
const SENSITIVE_SUFFIX = 'sensitive';
const WILDCARD_NAME = 'star*light';
const AGE_OVERLAP = 30;
const AGE_SECOND_GROUP_ONLY = 40;
const AGE_NO_MATCH = 20;
const FIND_AGE_THRESHOLD = 35;
const COUNT_AGE_THRESHOLD = 25;

type PatternFilter = {
  operator: CleanedWhere['operator'];
  value: string;
  mode?: 'insensitive' | undefined;
};

// Guards the native q.count() fast path: a filterless count must see every row
// even when the result set exceeds AceBase's implicit take of 100 and
// better-auth's defaultFindManyLimit of 100.
export const unfilteredCountTestSuite = createTestSuite(
  'AceBase unfiltered count beyond default limit',
  {},
  ({ adapter, insertRandom }) => ({
    'count returns more than defaultFindManyLimit (100)': async () => {
      await insertRandom('user', COUNT_TARGET);
      const count = await adapter.count({ model: 'user' });
      if (count !== COUNT_TARGET) {
        throw new Error(`expected ${COUNT_TARGET}, got ${count}`);
      }
    },
  })
);

// Regression: AceBase's `like` operator always ignores case, so the sensitive
// contains / starts_with / ends_with handlers silently degraded to
// case-insensitive matching. They must use anchored regular expressions
// without the `i` flag instead.
export const caseSensitivePatternOperatorsTestSuite = createTestSuite(
  'AceBase case-sensitive pattern operators reject different case',
  {},
  ({ adapter, generate, insertRandom }) => {
    const expectNoDifferentCaseMatch = async (
      filter: PatternFilter
    ): Promise<void> => {
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: SENSITIVE_NAME },
        forceAllowId: true,
      });
      await insertRandom('user', RANDOM_FILL_ROWS);

      const matches = (await adapter.findMany({
        model: 'user',
        where: [{ field: 'name', ...filter }],
      })) as Array<{ id: string }>;

      expect(matches).toHaveLength(0);
    };

    return {
      'contains with default mode does not match different case': () =>
        expectNoDifferentCaseMatch({
          operator: 'contains',
          value: LOWERCASE_NAME,
        }),
      'starts_with with default mode does not match different case': () =>
        expectNoDifferentCaseMatch({
          operator: 'starts_with',
          value: SENSITIVE_PREFIX,
        }),
      'ends_with with default mode does not match different case': () =>
        expectNoDifferentCaseMatch({
          operator: 'ends_with',
          value: SENSITIVE_SUFFIX,
        }),
    };
  }
);

export const patternInsensitiveAndWildcardTestSuite = createTestSuite(
  'AceBase pattern operators honor insensitive mode and literal wildcards',
  {},
  ({ adapter, generate, insertRandom }) => {
    const expectSingleMatch = async (
      seededName: string,
      filter: PatternFilter
    ): Promise<void> => {
      const created = await adapter.create<{ id: string }>({
        model: 'user',
        data: { ...(await generate('user')), name: seededName },
        forceAllowId: true,
      });
      await insertRandom('user', RANDOM_FILL_ROWS);

      const matches = (await adapter.findMany({
        model: 'user',
        where: [{ field: 'name', ...filter }],
      })) as Array<{ id: string }>;

      expect(matches.map((row) => row.id)).toEqual([created.id]);
    };

    return {
      'contains with insensitive mode matches ignoring case': () =>
        expectSingleMatch(SENSITIVE_NAME, {
          operator: 'contains',
          value: LOWERCASE_NAME,
          mode: 'insensitive',
        }),
      'contains matches wildcard characters literally': () =>
        expectSingleMatch(WILDCARD_NAME, {
          operator: 'contains',
          value: WILDCARD_NAME,
        }),
    };
  }
);

// Regression: OR clauses run as one query per group; a row matching several
// groups used to be duplicated in findMany results and double-counted in count.
export const overlappingOrGroupsDeduplicationTestSuite = createTestSuite(
  'AceBase overlapping OR groups are deduplicated',
  { defaultBetterAuthOptions: extendedUserModelOptions },
  ({ adapter, generate }) => {
    const createUser = async (name: string, age: number): Promise<void> => {
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name, age },
        forceAllowId: true,
      });
    };

    return {
      'findMany returns a row matching several groups only once': async () => {
        await createUser('Overlap', AGE_OVERLAP);
        await createUser('SecondGroupOnly', AGE_SECOND_GROUP_ONLY);
        await createUser('NoMatch', AGE_NO_MATCH);

        const rows = (await adapter.findMany({
          model: 'user',
          where: [
            { field: 'name', value: 'Overlap', operator: 'eq' },
            {
              field: 'age',
              value: FIND_AGE_THRESHOLD,
              operator: 'gte',
              connector: 'OR',
            },
          ],
        })) as Array<{ name?: string }>;

        expect(rows.map((row) => row.name).sort()).toEqual([
          'Overlap',
          'SecondGroupOnly',
        ]);
      },
      'count counts a row matching several groups only once': async () => {
        await createUser('Overlap', AGE_OVERLAP);
        await createUser('NoMatch', AGE_NO_MATCH);

        const total = await adapter.count({
          model: 'user',
          where: [
            { field: 'name', value: 'Overlap', operator: 'eq' },
            {
              field: 'age',
              value: COUNT_AGE_THRESHOLD,
              operator: 'gte',
              connector: 'OR',
            },
          ],
        });

        expect(total).toBe(1);
      },
    };
  }
);
