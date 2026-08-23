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
const REGEXP_NAME = 'value.(one)';
const AGE_OVERLAP = 30;
const AGE_SECOND_GROUP_ONLY = 40;
const AGE_NO_MATCH = 20;
const FIND_AGE_THRESHOLD = 35;
const COUNT_AGE_THRESHOLD = 25;

type PatternFilter = {
  operator: CleanedWhere['operator'];
  value: CleanedWhere['value'];
  mode?: 'insensitive' | undefined;
};

type TestHelpers = Parameters<Parameters<typeof createTestSuite>[2]>[0];

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

const expectSingleMatch = async (
  { adapter, generate, insertRandom }: TestHelpers,
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

const patternMatchTests = (helpers: TestHelpers) => ({
  'contains with insensitive mode matches ignoring case': () =>
    expectSingleMatch(helpers, SENSITIVE_NAME, {
      operator: 'contains',
      value: LOWERCASE_NAME,
      mode: 'insensitive',
    }),
  'contains matches wildcard characters literally': () =>
    expectSingleMatch(helpers, WILDCARD_NAME, {
      operator: 'contains',
      value: WILDCARD_NAME,
    }),
  'in with insensitive mode matches case-insensitively': () =>
    expectSingleMatch(helpers, SENSITIVE_NAME, {
      operator: 'in',
      value: [LOWERCASE_NAME],
      mode: 'insensitive',
    }),
  'in treats regular-expression characters literally': () =>
    expectSingleMatch(helpers, REGEXP_NAME, {
      operator: 'in',
      value: [REGEXP_NAME],
      mode: 'insensitive',
    }),
});

const emptyListTests = ({ adapter, generate }: TestHelpers) => {
  const matchesWithEmptyList = async (operator: 'in' | 'not_in') => {
    await adapter.create({
      model: 'user',
      data: { ...(await generate('user')), name: '' },
      forceAllowId: true,
    });

    return adapter.findMany({
      model: 'user',
      where: [{ field: 'name', operator, value: [], mode: 'insensitive' }],
    });
  };

  return {
    'in with an empty list matches no rows': async () => {
      expect(await matchesWithEmptyList('in')).toHaveLength(0);
    },
    'not_in with an empty list matches every row': async () => {
      expect(await matchesWithEmptyList('not_in')).toHaveLength(1);
    },
  };
};

const patternOperatorTests = (helpers: TestHelpers) => ({
  ...patternMatchTests(helpers),
  ...emptyListTests(helpers),
});

export const patternInsensitiveAndWildcardTestSuite = createTestSuite(
  'AceBase pattern operators honor insensitive mode and literal wildcards',
  {},
  patternOperatorTests
);

const overlapWhere = (age: number) => [
  { field: 'name', value: 'Overlap', operator: 'eq' as const },
  {
    field: 'age',
    value: age,
    operator: 'gte' as const,
    connector: 'OR' as const,
  },
];

const createUserWith =
  ({ adapter, generate }: TestHelpers) =>
  async (name: string, age: number): Promise<string> => {
    const user = await adapter.create<{ id: string }>({
      model: 'user',
      data: { ...(await generate('user')), name, age },
      forceAllowId: true,
    });

    return user.id;
  };

const overlappingReadTests = (helpers: TestHelpers) => {
  const { adapter } = helpers;
  const createUser = createUserWith(helpers);

  return {
    'findMany returns a row matching several groups only once': async () => {
      await createUser('Overlap', AGE_OVERLAP);
      await createUser('SecondGroupOnly', AGE_SECOND_GROUP_ONLY);
      await createUser('NoMatch', AGE_NO_MATCH);
      const rows = (await adapter.findMany({
        model: 'user',
        where: overlapWhere(FIND_AGE_THRESHOLD),
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
        where: overlapWhere(COUNT_AGE_THRESHOLD),
      });

      expect(total).toBe(1);
    },
  };
};

const overlappingWriteTests = (helpers: TestHelpers) => {
  const { adapter } = helpers;
  const createUser = createUserWith(helpers);

  return {
    'updateMany updates and counts an overlapping row once': async () => {
      const id = await createUser('Overlap', AGE_OVERLAP);
      const total = await adapter.updateMany({
        model: 'user',
        where: overlapWhere(COUNT_AGE_THRESHOLD),
        update: { name: 'Updated' },
      });

      expect(total).toBe(1);
      expect(
        await adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: id, operator: 'eq' }],
        })
      ).toMatchObject({ name: 'Updated' });
    },
    'deleteMany deletes and counts an overlapping row once': async () => {
      const id = await createUser('Overlap', AGE_OVERLAP);
      const total = await adapter.deleteMany({
        model: 'user',
        where: overlapWhere(COUNT_AGE_THRESHOLD),
      });

      expect(total).toBe(1);
      expect(
        await adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: id, operator: 'eq' }],
        })
      ).toBeNull();
    },
  };
};

export const overlappingOrGroupsDeduplicationTestSuite = createTestSuite(
  'AceBase overlapping OR groups are deduplicated',
  { defaultBetterAuthOptions: extendedUserModelOptions },
  (helpers) => ({
    ...overlappingReadTests(helpers),
    ...overlappingWriteTests(helpers),
  })
);

const limitZeroWhere = [
  { field: 'name', value: 'LimitZero', operator: 'eq' as const },
  {
    field: 'name',
    value: 'LimitZero',
    operator: 'eq' as const,
    connector: 'OR' as const,
  },
];

export const findManyLimitZeroTestSuite = createTestSuite(
  'AceBase findMany limit zero returns no rows',
  {},
  ({ adapter, generate }) => ({
    'returns no rows for native and merged queries': async () => {
      await adapter.create({
        model: 'user',
        data: { ...(await generate('user')), name: 'LimitZero', age: 0 },
        forceAllowId: true,
      });
      const native = await adapter.findMany({
        model: 'user',
        where: limitZeroWhere.slice(0, 1),
        limit: 0,
      });
      const merged = await adapter.findMany({
        model: 'user',
        where: limitZeroWhere,
        limit: 0,
      });

      expect(native).toEqual([]);
      expect(merged).toEqual([]);
    },
  })
);
