import type { AceBase } from 'acebase';
import type { CleanedWhere, WhereOperator } from 'better-auth/adapters';

export type DataReferenceQuery = ReturnType<AceBase['query']>;

type FilterParams = Parameters<DataReferenceQuery['filter']>;

type ToFilterParams = (where: CleanedWhere) => FilterParams;

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

// Range operators behave identically in both modes.
const gt: ToFilterParams = ({ field, value }) => [field, '>', value];
const gte: ToFilterParams = ({ field, value }) => [field, '>=', value];
const lt: ToFilterParams = ({ field, value }) => [field, '<', value];
const lte: ToFilterParams = ({ field, value }) => [field, '<=', value];
const opIn: ToFilterParams = ({ field, value }) => [field, 'in', value];
const notIn: ToFilterParams = ({ field, value }) => [field, '!in', value];

// AceBase's in / !in compare values exactly, so the insensitive variants must
// go through a case-insensitive regex alternation instead.
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

// CleanedWhere keeps operator / mode as `T | undefined` in its public shape even though
// better-auth's factory fills both before the adapter ever sees a where clause; the guard
// below only satisfies the type checker and is unreachable at runtime.
const resolveFilterHandler = ({
  mode,
  operator,
}: CleanedWhere): ToFilterParams | undefined => {
  if (operator === undefined || mode === undefined) {
    return undefined;
  }
  return FILTERS_TABLE[operator][mode];
};

const toFilterParams = (where: CleanedWhere): FilterParams => {
  const handler = resolveFilterHandler(where);
  if (!handler) {
    throw new Error(`Unsupported where clause: ${JSON.stringify(where)}`);
  }

  return handler(where);
};

const splitByOrClause = (where: ReadonlyArray<CleanedWhere>) => {
  const groups: Array<Array<CleanedWhere>> = [];
  let current: Array<CleanedWhere> = [];
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

  return groups as ReadonlyArray<ReadonlyArray<CleanedWhere>>;
};

const toFilterParamsGroups = (
  where: ReadonlyArray<CleanedWhere>
): ReadonlyArray<ReadonlyArray<FilterParams>> =>
  splitByOrClause(where).map((g) => g.map(toFilterParams));

// AceBase filterless queries default to take=100; take the full set explicitly
export const TAKE_ALL = Number.MAX_SAFE_INTEGER;

// Number of independent OR groups a where-clause splits into (no where counts as one group).
export const orGroupCount = (where?: ReadonlyArray<CleanedWhere>): number =>
  where?.length ? splitByOrClause(where).length : 1;

export const buildQuery =
  (db: AceBase) =>
  (model: string) =>
  (where?: ReadonlyArray<CleanedWhere>): ReadonlyArray<DataReferenceQuery> =>
    where?.length
      ? toFilterParamsGroups(where).map((g) =>
          g.reduce((q, p) => q.filter(...p), db.query(model))
        )
      : [db.query(model)];
