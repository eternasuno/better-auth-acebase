import { createTestSuite } from '@better-auth/test-utils/adapter';
import { expect } from 'vitest';

const JOIN_LIMIT = 105;
// Small on purpose: with a shared global take() across parents, the second
// parent would lose rows to the first; per-key limits must give each parent
// its full quota.
const MULTI_PARENT_LIMIT = 3;

// better-auth's adapter factory injects a numeric limit into every join config
// (defaultFindManyLimit ?? 100; 1 for one-to-one), so an unset limit can never
// be observed from adapter code. What the adapter controls is honoring the
// limit it *is* given: verify an explicitly raised join limit is passed through
// to AceBase's take() and that all matching children reach the merged result.
//
// experimental.joins routes join results through the adapter; without it the
// core falls back to its own per-parent queries and never calls adapter code.
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

// AceBase's take(0) means unlimited, but better-auth semantics demand zero
// joined children; the adapter must short-circuit instead of querying.
// Covers a parent that has children and a childless one in the same query.
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
  { defaultBetterAuthOptions: { experimental: { joins: true } } },
  (helpers) => ({
    'findMany join returns every child row up to the explicit join limit': () =>
      explicitLimitJoinsAllChildren(helpers),
    'each of multiple parents independently receives the explicit join limit':
      () => eachParentReceivesItsOwnLimit(helpers),
    'explicit join limit of 0 joins no children': () =>
      limitZeroJoinsNoChildren(helpers),
  })
);
