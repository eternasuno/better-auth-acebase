import type { AceBase } from 'acebase';
import type { CleanedWhere, WhereOperator } from 'better-auth/adapters';

export type DataReferenceQuery = ReturnType<AceBase['query']>;

type FilterParams = Parameters<DataReferenceQuery['filter']>;

type Where = Omit<CleanedWhere, 'connector'>;

type ToFilterParams = (where: Where) => FilterParams;

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
const resolveFilterHandler = ({ mode, operator }: Where) => {
  if (operator === undefined || mode === undefined) {
    return undefined;
  }

  return FILTERS_TABLE[operator][mode];
};

export const toFilterParams = (where: Where): FilterParams => {
  const handler = resolveFilterHandler(where);
  if (!handler) {
    throw new Error(`Unsupported where clause: ${JSON.stringify(where)}`);
  }

  return handler(where);
};

export const splitByOrClause = (
  where: ReadonlyArray<CleanedWhere>
): ReadonlyArray<ReadonlyArray<Where>> => {
  const groups: Array<Array<Where>> = [];
  let current: Array<Where> = [];
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
