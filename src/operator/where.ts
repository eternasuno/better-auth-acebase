import type { CleanedWhere, WhereOperator } from 'better-auth/adapters';
import type {
  AceBaseFilterParams,
  AceBaseValue,
  BetterAuthWhere,
  BetterAuthWhereGroup,
} from './types.ts';

type ToFilterParams = (where: BetterAuthWhere) => AceBaseFilterParams;

type WhereOp = {
  sensitive: ToFilterParams;
  insensitive: ToFilterParams;
};

const insensitiveContains: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(RegExp.escape(String(value)), 'i'),
];

const sensitiveContains: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(RegExp.escape(String(value))),
];

const insensitiveEndsWith: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(`${RegExp.escape(String(value))}$`, 'i'),
];

const sensitiveEndsWith: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(`${RegExp.escape(String(value))}$`),
];

const insensitiveEq: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(`^${RegExp.escape(String(value))}$`, 'i'),
];

const sensitiveEq: ToFilterParams = ({ field, value }) => [field, '==', value];

const insensitiveNe: ToFilterParams = ({ field, value }) => [
  field,
  '!matches',
  new RegExp(`^${RegExp.escape(String(value))}$`, 'i'),
];

const sensitiveNe: ToFilterParams = ({ field, value }) => [field, '!=', value];

const gt: ToFilterParams = ({ field, value }) => [field, '>', value];
const gte: ToFilterParams = ({ field, value }) => [field, '>=', value];
const lt: ToFilterParams = ({ field, value }) => [field, '<', value];
const lte: ToFilterParams = ({ field, value }) => [field, '<=', value];
const opIn: ToFilterParams = ({ field, value }) => [field, 'in', value];
const notIn: ToFilterParams = ({ field, value }) => [field, '!in', value];

// AceBase compares in / !in values exactly; insensitive variants need regex alternation.
const toAlternation = (values: ReadonlyArray<unknown>) =>
  values.length === 0
    ? '(?!)'
    : values.map((value) => RegExp.escape(String(value))).join('|');

const insensitiveIn: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(`^(${toAlternation(value as ReadonlyArray<unknown>)})$`, 'i'),
];

const insensitiveNotIn: ToFilterParams = ({ field, value }) => [
  field,
  '!matches',
  new RegExp(`^(${toAlternation(value as ReadonlyArray<unknown>)})$`, 'i'),
];

const insensitiveStartsWith: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(`^${RegExp.escape(String(value))}`, 'i'),
];

const sensitiveStartsWith: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(`^${RegExp.escape(String(value))}`),
];

const FILTERS_TABLE: Record<WhereOperator, WhereOp> = {
  contains: { insensitive: insensitiveContains, sensitive: sensitiveContains },
  ends_with: { insensitive: insensitiveEndsWith, sensitive: sensitiveEndsWith },
  eq: { insensitive: insensitiveEq, sensitive: sensitiveEq },
  gt: { insensitive: gt, sensitive: gt },
  gte: { insensitive: gte, sensitive: gte },
  in: { insensitive: insensitiveIn, sensitive: opIn },
  lt: { insensitive: lt, sensitive: lt },
  lte: { insensitive: lte, sensitive: lte },
  ne: { insensitive: insensitiveNe, sensitive: sensitiveNe },
  not_in: { insensitive: insensitiveNotIn, sensitive: notIn },
  starts_with: {
    insensitive: insensitiveStartsWith,
    sensitive: sensitiveStartsWith,
  },
};

// operator / mode are typed optional but better-auth fills both before the adapter
// sees them; the guard only satisfies the type checker and is unreachable at runtime.
const resolveFilterHandler = ({ mode, operator }: BetterAuthWhere) => {
  if (operator === undefined || mode === undefined) {
    return undefined;
  }

  return FILTERS_TABLE[operator][mode];
};

export const toFilterParams = (where: BetterAuthWhere): AceBaseFilterParams => {
  const handler = resolveFilterHandler(where);
  if (!handler) {
    throw new Error(`Unsupported where clause: ${JSON.stringify(where)}`);
  }

  return handler(where);
};

export const splitByOrClause = (
  where: ReadonlyArray<CleanedWhere>
): ReadonlyArray<BetterAuthWhereGroup> => {
  const groups: Array<BetterAuthWhereGroup> = [];
  let current: Array<BetterAuthWhere> = [];
  for (const clause of where) {
    if (clause.connector === 'OR' && current.length > 0) {
      groups.push(current);
      current = [];
    }

    current.push(clause);
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
};

type TestWhere = (where: BetterAuthWhere) => (value: AceBaseValue) => boolean;

const testEquals: TestWhere = (where) => (value) => {
  const actual = value[where.field];
  const expected = where.value;

  if (
    where.mode !== 'insensitive' ||
    typeof actual !== 'string' ||
    typeof expected !== 'string'
  ) {
    return actual === expected;
  }

  return actual.toLowerCase() === expected.toLowerCase();
};

const testContains: TestWhere = (where) => (value) => {
  const actual = value[where.field];
  const expected = where.value;
  if (typeof actual !== 'string' || typeof expected !== 'string') {
    return false;
  }

  return where.mode === 'insensitive'
    ? actual.toLowerCase().includes(expected.toLowerCase())
    : actual.includes(expected);
};

const testStartsWith: TestWhere = (where) => (value) => {
  const actual = value[where.field];
  const expected = where.value;
  if (typeof actual !== 'string' || typeof expected !== 'string') {
    return false;
  }

  return where.mode === 'insensitive'
    ? actual.toLowerCase().startsWith(expected.toLowerCase())
    : actual.startsWith(expected);
};

const testEndsWith: TestWhere = (where) => (value) => {
  const actual = value[where.field];
  const expected = where.value;
  if (typeof actual !== 'string' || typeof expected !== 'string') {
    return false;
  }

  return where.mode === 'insensitive'
    ? actual.toLowerCase().endsWith(expected.toLowerCase())
    : actual.endsWith(expected);
};

const testIn: TestWhere = (where) => (value) => {
  if (!Array.isArray(where.value)) {
    return false;
  }

  return where.value.some((expected) =>
    testEquals({ ...where, operator: 'eq', value: expected })(value)
  );
};

const testGreaterThan: TestWhere = (where) => (value) =>
  typeof value[where.field] === typeof where.value &&
  value[where.field] !== null &&
  where.value !== null &&
  value[where.field] > where.value;

const testGreaterThanOrEqual: TestWhere = (where) => (value) =>
  typeof value[where.field] === typeof where.value &&
  value[where.field] !== null &&
  where.value !== null &&
  value[where.field] >= where.value;

const testLessThan: TestWhere = (where) => (value) =>
  typeof value[where.field] === typeof where.value &&
  value[where.field] !== null &&
  where.value !== null &&
  value[where.field] < where.value;

const testLessThanOrEqual: TestWhere = (where) => (value) =>
  typeof value[where.field] === typeof where.value &&
  value[where.field] !== null &&
  where.value !== null &&
  value[where.field] <= where.value;

const testNotEquals: TestWhere = (where) => (value) =>
  !testEquals(where)(value);

const testNotIn: TestWhere = (where) => (value) => !testIn(where)(value);

const TESTS: Record<WhereOperator, TestWhere> = {
  contains: testContains,
  ends_with: testEndsWith,
  eq: testEquals,
  gt: testGreaterThan,
  gte: testGreaterThanOrEqual,
  in: testIn,
  lt: testLessThan,
  lte: testLessThanOrEqual,
  ne: testNotEquals,
  not_in: testNotIn,
  starts_with: testStartsWith,
};

const testWhere = (value: AceBaseValue, where: BetterAuthWhere) => {
  if (where.operator === undefined) {
    return false;
  }

  return TESTS[where.operator](where)(value);
};

export const matchesWhere =
  (where: ReadonlyArray<CleanedWhere>) =>
  (value: AceBaseValue): boolean =>
    !where.length ||
    splitByOrClause(where).some((group) =>
      group.every((clause) => testWhere(value, clause))
    );
