import type { CreatorConfig } from './join.ts';

// `id` is declared (not just carried by the index signature) so record access can
// use plain dot notation: TS's noPropertyAccessFromIndexSignature forces bracket
// access for index-signature-only keys, while Biome's useLiteralKeys forbids it.
export type Value = { id?: string } & Record<string, unknown>;

// AceBase drops null values (its node writer silently skips null children) and rejects arrays
// containing them, so null cannot be persisted directly. Nulls are encoded as this sentinel
// string on write and decoded back to null on read — including values nested inside json
// fields and arrays.
//
// The random-looking suffix is fixed on purpose: it keeps the marker stable across
// processes and versions while making an accidental collision with real user data
// practically impossible (the exact-match ambiguity documented below remains purely
// theoretical).
export const NULL_MARKER =
  '__acebase_null__:v2:1fc8c21f5a3f015e455c7379d0c42e6c';

const isPlainContainer = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  (Array.isArray(value) ||
    Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

// Depth-first copy-on-write rewrite: every child goes through `walk`, and a container is
// cloned only when at least one of its children actually changed.
const convertChildren =
  (walk: (value: unknown) => unknown) =>
  (container: Array<unknown> | Record<string, unknown>): unknown => {
    const clone = (
      Array.isArray(container) ? [...container] : { ...container }
    ) as Record<string, unknown>;
    let changed = false;
    for (const key of Object.keys(clone)) {
      const converted = walk(clone[key]);
      if (converted !== clone[key]) {
        changed = true;
        clone[key] = converted;
      }
    }

    return changed ? clone : container;
  };

const deepNullMarker =
  (
    transform: (value: unknown) => unknown,
    matches: (value: unknown) => boolean
  ) =>
  <T>(value: T): T => {
    const walk = (node: unknown): unknown => {
      if (matches(node)) {
        return transform(node);
      }
      if (!isPlainContainer(node)) {
        return node;
      }

      return convertChildren(walk)(
        node as Array<unknown> | Record<string, unknown>
      );
    };

    return walk(value) as T;
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
  limit?: number | undefined;
  offset?: number | undefined;
};

export const applySlice =
  ({ offset = 0, limit }: SliceParams) =>
  <T extends Value>(values: Array<T>) =>
    limit === undefined
      ? values.slice(offset)
      : values.slice(offset, offset + limit);

type SelectParams = {
  select?: ReadonlyArray<string> | undefined;
  creatorConfig: CreatorConfig;
  model: string;
};

const applyItemSelect =
  ({ select, creatorConfig: { getFieldName }, model }: SelectParams) =>
  <T extends Value>(item: T) => {
    const aliasedSelect = new Set(
      select?.map((f) => getFieldName({ field: f, model }))
    );
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
    params.select?.length
      ? items.map((i) => applyItemSelect(params)(i))
      : items;

export type SortBy = {
  field: string;
  direction: 'asc' | 'desc';
};

const isMissingValue = (value: unknown): boolean =>
  value === undefined || (typeof value === 'number' && Number.isNaN(value));

// Runtime type ranks giving a total order across mixed types: number < string < boolean < other.
const RANK_NUMBER = 0;
const RANK_STRING = 1;
const RANK_BOOLEAN = 2;
const RANK_OTHER = 3;

const typeRank = (value: unknown): number => {
  switch (typeof value) {
    case 'number':
      return RANK_NUMBER;
    case 'string':
      return RANK_STRING;
    case 'boolean':
      return RANK_BOOLEAN;
    default:
      return RANK_OTHER;
  }
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

// Missing values always sort last regardless of direction; undefined means both are present.
const compareMissing = (a: unknown, b: unknown): number | undefined => {
  const missingA = isMissingValue(a);
  const missingB = isMissingValue(b);
  if (!missingA && !missingB) {
    return undefined;
  }
  if (missingA && missingB) {
    return 0;
  }

  return missingA ? 1 : -1;
};

// Cross-type ordering by runtime rank; equal ranks defer to the natural comparison.
const compareByRank = (a: unknown, b: unknown): number => {
  const rankA = typeRank(a);
  const rankB = typeRank(b);
  if (rankA !== rankB) {
    return rankA < rankB ? -1 : 1;
  }

  return 0;
};

// Builds the comparator for one sort config; missing values sort last regardless of
// direction, then cross-type ranks, and direction applies only to the natural comparison.
const comparatorFor =
  ({ field, direction }: SortBy) =>
  <T extends Value>(a: T, b: T): number => {
    const va = a[field];
    const vb = b[field];

    const missingOrder = compareMissing(va, vb);
    if (missingOrder !== undefined) {
      return missingOrder;
    }

    const crossTypeOrder = compareByRank(va, vb);
    if (crossTypeOrder !== 0) {
      return crossTypeOrder;
    }

    const natural = compareValues(va, vb);

    return direction === 'asc' ? natural : -natural;
  };

export const applySort =
  (config?: SortBy | undefined) =>
  <T extends Value>(values: Array<T>): Array<T> =>
    config ? [...values].sort(comparatorFor(config)) : values;
