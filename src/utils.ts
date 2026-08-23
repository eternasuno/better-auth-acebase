import type { CreatorConfig } from './join.ts';

export type Value = Record<string, unknown>;

// AceBase drops null values (its node writer silently skips null children) and rejects arrays
// containing them, so null cannot be persisted directly. Nulls are encoded as this sentinel
// string on write and decoded back to null on read — including values nested inside json
// fields and arrays.
//
// The random-looking suffix is fixed on purpose: it keeps the marker stable across
// processes and versions while making an accidental collision with real user data
// practically impossible (the exact-match ambiguity documented below remains purely
// theoretical).
export const NULL_MARKER = '__acebase_null__:v2:1fc8c21f5a3f015e455c7379d0c42e6c';

const isPlainContainer = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  (Array.isArray(value) ||
    Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const deepNullMarker =
  (transform: (value: unknown) => unknown, matches: (value: unknown) => boolean) =>
  <T>(value: T): T => {
    if (matches(value)) {
      return transform(value) as T;
    }
    if (!isPlainContainer(value)) {
      return value;
    }
    let changed = false;
    const container = value as Record<string, unknown> | Array<unknown>;
    const result = (Array.isArray(container) ? [...container] : { ...container }) as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(result)) {
      const converted = deepNullMarker(transform, matches)(result[key]);
      if (converted !== result[key]) {
        changed = true;
        result[key] = converted;
      }
    }
    return changed ? (result as T) : value;
  };

// The mapping must stay IDEMPOTENT (toNullMarker(toNullMarker(v)) === toNullMarker(v)):
// better-auth's factory runs customTransformInput over where-clause values unconditionally,
// and stacked adapter factories apply it again (@better-auth/test-utils wraps the real adapter
// in an outer factory whose disableTransformInput only exempts data, not where clauses —
// verified against better-auth 1.6.29). A value may therefore be encoded more than once.
//
// That rules out collision-proof escaping schemes (e.g. prefix doubling): idempotence plus a
// total decode forces encode(M) === M, which in turn makes a stored string equal to the
// sentinel indistinguishable from an encoded null. The trade-off is accepted and documented:
// a stored string exactly equal to NULL_MARKER reads back as null (in practice only if data
// deliberately contains the marker itself).
export const toNullMarker = deepNullMarker(
  () => NULL_MARKER,
  (v) => v === null
);

export const fromNullMarker = deepNullMarker(
  () => null,
  (v) => v === NULL_MARKER
);

type SliceParams = {
  offset?: number;
  limit?: number;
};

export const applySlice =
  ({ offset = 0, limit }: SliceParams) =>
  <T extends Value>(values: Array<T>) =>
    limit === undefined ? values.slice(offset) : values.slice(offset, offset + limit);

type SelectParams = {
  select?: ReadonlyArray<string>;
  creatorConfig: CreatorConfig;
  model: string;
};

const applyItemSelect =
  ({ select, creatorConfig: { getFieldName }, model }: SelectParams) =>
  <T extends Value>(item: T) => {
    const aliasedSelect = new Set(select?.map((f) => getFieldName({ field: f, model })));
    const result: Value = {};
    for (const [key, value] of Object.entries(item)) {
      if (!aliasedSelect.has(key)) {
        continue;
      }

      result[key] = value;
    }

    return result;
  };

export const applySelect =
  (params: SelectParams) =>
  <T extends Value>(items: Array<T>) =>
    params.select?.length ? items.map((i) => applyItemSelect(params)(i)) : items;

export type SortBy = {
  field: string;
  direction: 'asc' | 'desc';
};

const isMissingValue = (value: unknown): boolean =>
  value === undefined || (typeof value === 'number' && Number.isNaN(value));

// Runtime type rank giving a total order across mixed types: number < string < boolean < other.
const typeRank = (value: unknown): number => {
  if (typeof value === 'number') {
    return 0;
  }
  if (typeof value === 'string') {
    return 1;
  }
  if (typeof value === 'boolean') {
    return 2;
  }

  return 3;
};

// Natural comparison within a single runtime type rank; other values fall back to their
// string form (equal forms yield 0, so sort stability keeps their relative order).
const compareValues = (a: unknown, b: unknown): number => {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  const sa = String(a);
  const sb = String(b);
  if (sa === sb) {
    return 0;
  }

  return sa < sb ? -1 : 1;
};

export const applySort =
  (config?: SortBy) =>
  <T extends Value>(values: Array<T>) =>
    config
      ? [...values].sort((a, b) => {
          const va = a[config.field];
          const vb = b[config.field];
          const missingA = isMissingValue(va);
          const missingB = isMissingValue(vb);

          // Missing values always sort last, regardless of direction.
          if (missingA || missingB) {
            if (missingA && missingB) {
              return 0;
            }

            return missingA ? 1 : -1;
          }

          const rankA = typeRank(va);
          const rankB = typeRank(vb);
          if (rankA !== rankB) {
            return rankA < rankB ? -1 : 1;
          }

          // Direction applies only to the value comparison itself.
          return compareValues(va, vb) * (config.direction === 'asc' ? 1 : -1);
        })
      : values;
