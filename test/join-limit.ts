import { createTestSuite } from '@better-auth/test-utils/adapter';
import { expect } from 'vitest';

const JOIN_LIMIT = 105;
const MULTI_PARENT_LIMIT = 3;

type TestHelpers = Parameters<Parameters<typeof createTestSuite>[2]>[0];

const createUser = async ({ adapter, generate }: TestHelpers) =>
  adapter.create<{ id: string }>({
    model: 'user',
    data: await generate('user'),
    forceAllowId: true,
  });

const createSessions = async (
  { adapter, generate }: TestHelpers,
  userId: string,
  count: number
) => {
  for (let i = 0; i < count; i++) {
    await adapter.create({
      model: 'session',
      data: { ...(await generate('session')), userId },
      forceAllowId: true,
    });
  }
};

const explicitLimitJoinsAllChildren = async (helpers: TestHelpers) => {
  const parent = await createUser(helpers);
  await createSessions(helpers, parent.id, JOIN_LIMIT);

  const rows = (await helpers.adapter.findMany({
    model: 'user',
    where: [{ field: 'id', value: parent.id, operator: 'eq' }],
    join: { session: { limit: JOIN_LIMIT } },
  })) as Array<{ session?: unknown[] }>;

  expect(rows).toHaveLength(1);
  expect(rows[0]?.session).toHaveLength(JOIN_LIMIT);
};

const eachParentReceivesItsOwnLimit = async (helpers: TestHelpers) => {
  const parents = await Promise.all([createUser(helpers), createUser(helpers)]);
  await Promise.all(
    parents.map((parent) =>
      createSessions(helpers, parent.id, MULTI_PARENT_LIMIT + 1)
    )
  );
  const ids = parents.map((parent) => parent.id);

  const rows = (await helpers.adapter.findMany({
    model: 'user',
    where: [{ field: 'id', operator: 'in', value: ids }],
    join: { session: { limit: MULTI_PARENT_LIMIT } },
  })) as Array<{ session?: unknown[] }>;

  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.session).toHaveLength(MULTI_PARENT_LIMIT);
  }
};

const limitZeroJoinsNoChildren = async (helpers: TestHelpers) => {
  const [withChildren, childless] = await Promise.all([
    createUser(helpers),
    createUser(helpers),
  ]);
  await createSessions(helpers, withChildren.id, MULTI_PARENT_LIMIT);

  const rows = (await helpers.adapter.findMany({
    model: 'user',
    where: [
      {
        field: 'id',
        operator: 'in',
        value: [withChildren.id, childless.id],
      },
    ],
    join: { session: { limit: 0 } },
  })) as Array<{ session?: unknown[] }>;

  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.session).toEqual([]);
  }
};

export const joinExplicitLimitTestSuite = createTestSuite(
  'AceBase join honors an explicit join limit',
  { defaultBetterAuthOptions: {} },
  (helpers) => ({
    'findMany join returns every child row up to the explicit join limit': () =>
      explicitLimitJoinsAllChildren(helpers),
    'each of multiple parents independently receives the explicit join limit':
      () => eachParentReceivesItsOwnLimit(helpers),
    'explicit join limit of 0 joins no children': () =>
      limitZeroJoinsNoChildren(helpers),
  })
);
