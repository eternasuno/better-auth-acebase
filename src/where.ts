import type { AceBase } from 'acebase';
import type { CleanedWhere, WhereOperator } from 'better-auth/adapters';

type DataReferenceQuery = ReturnType<AceBase['query']>;

type FilterParams = Parameters<DataReferenceQuery['filter']>;

type ToFilterParams = (where: CleanedWhere) => FilterParams;

type WhereOp = { sensitive: ToFilterParams; insensitive: ToFilterParams } | ToFilterParams;

const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const insensitiveContains: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(escapeRegExp(String(value)), 'i'),
];

const sensitiveContains: ToFilterParams = ({ field, value }) => [field, 'like', `*${value}*`];

const insensitiveEndsWith: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(`${escapeRegExp(String(value))}$`, 'i'),
];

const sensitiveEndsWith: ToFilterParams = ({ field, value }) => [field, 'like', `*${value}`];

const insensitiveEq: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(`^${escapeRegExp(String(value))}$`, 'i'),
];

const sensitiveEq: ToFilterParams = ({ field, value }) => [field, '==', value];

const insensitiveNe: ToFilterParams = ({ field, value }) => [
  field,
  '!matches',
  new RegExp(`^${escapeRegExp(String(value))}$`, 'i'),
];

const sensitiveNe: ToFilterParams = ({ field, value }) => [field, '!=', value];

// ponytail: gt, gte, lt, lte, in, not_in are identical in both modes — single handler
const gt: ToFilterParams = ({ field, value }) => [field, '>', value];
const gte: ToFilterParams = ({ field, value }) => [field, '>=', value];
const lt: ToFilterParams = ({ field, value }) => [field, '<', value];
const lte: ToFilterParams = ({ field, value }) => [field, '<=', value];
const opIn: ToFilterParams = ({ field, value }) => [field, 'in', value];
const notIn: ToFilterParams = ({ field, value }) => [field, '!in', value];

const insensitiveStartsWith: ToFilterParams = ({ field, value }) => [
  field,
  'matches',
  new RegExp(`^${escapeRegExp(String(value))}`, 'i'),
];

const sensitiveStartsWith: ToFilterParams = ({ field, value }) => [field, 'like', `${value}*`];

const FILTERS_TABLE: Record<WhereOperator, WhereOp> = {
  contains: { insensitive: insensitiveContains, sensitive: sensitiveContains },
  ends_with: { insensitive: insensitiveEndsWith, sensitive: sensitiveEndsWith },
  eq: { insensitive: insensitiveEq, sensitive: sensitiveEq },
  gt,
  gte,
  in: opIn,
  lt,
  lte,
  ne: { insensitive: insensitiveNe, sensitive: sensitiveNe },
  not_in: notIn,
  starts_with: { insensitive: insensitiveStartsWith, sensitive: sensitiveStartsWith },
};

const toFilterParams = (where: CleanedWhere) => {
  const op = FILTERS_TABLE[where.operator];
  const handler = typeof op === 'function' ? op : op[where.mode];
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

const TAKE_ALL = Number.MAX_SAFE_INTEGER; // AceBase filterless queries default to take=100; take the full set explicitly

export const buildQuery =
  (db: AceBase) =>
  (model: string) =>
  (where?: ReadonlyArray<CleanedWhere>): ReadonlyArray<DataReferenceQuery> =>
    where?.length
      ? toFilterParamsGroups(where).map((g) =>
          g.reduce((q, p) => q.filter(...p), db.query(model).take(TAKE_ALL))
        )
      : [db.query(model).take(TAKE_ALL)];
