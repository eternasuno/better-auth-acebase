import type { CreatorConfig } from './join.ts';

// `id` is declared (not just carried by the index signature) so record access can
// use plain dot notation: TS's noPropertyAccessFromIndexSignature forces bracket
// access for index-signature-only keys, while Biome's useLiteralKeys forbids it.
export type Value = { id?: string } & Record<string, unknown>;

// AceBase drops null values, so nullable fields cannot be persisted directly. Better Auth
// serializes JSON and arrays before these transforms run; only a field-level null needs this
// sentinel on write and decoding on read.
//
// The random-looking suffix is fixed on purpose: it keeps the marker stable across
// processes and versions while making an accidental collision with real user data
// practically impossible (the exact-match ambiguity documented below remains purely
// theoretical).
export const NULL_MARKER =
  '__acebase_null__:v2:1fc8c21f5a3f015e455c7379d0c42e6c';

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
export const toNullMarker = <T>(value: T): T =>
  (value === null ? NULL_MARKER : value) as T;

export const fromNullMarker = <T>(value: T): T =>
  (value === NULL_MARKER ? null : value) as T;

type SliceParams = {
  limit?: number | undefined;
  offset?: number | undefined;
};

export const applySlice =
  ({ offset = 0, limit }: SliceParams) =>
  <T>(values: Array<T>): Array<T> =>
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

// A record paired with its storage path. AceBase's native sort breaks ties by
// comparing snapshot paths, so the OR-merge pipeline carries paths alongside
// the values instead of bare records.
export type SnapshotEntry<T extends Value = Value> = {
  readonly path: string;
  readonly value: T;
};

// Minimal equivalent of PathInfo.getPathKeys from acebase-core 1.28.1,
// which AceBase 1.29.13 uses for native query sorting.
const sortKeySegments = (field: string): ReadonlyArray<string | number> => {
  const normalized = field
    .replace(/\[/g, '/[')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (normalized.length === 0) {
    return [];
  }

  return normalized.split('/').map((key) => {
    if (!key.startsWith('[')) {
      return key;
    }

    // biome-ignore lint/correctness/useParseIntRadix: PathInfo uses parseInt without radix
    return Number.parseInt(key.slice(1, -1));
  });
};

// Port of the native lookup in query.js sortMatches: walking stops at null or
// non-object nodes and at absent keys, every miss resolving to null.
const resolveSortValue = (
  record: Value,
  segments: ReadonlyArray<string | number>
): unknown =>
  segments.reduce<unknown>((node, segment) => {
    if (node === null || typeof node !== 'object' || !(segment in node)) {
      return null;
    }

    return (node as Record<string, unknown>)[segment];
  }, record);

const looselyEquals = (left: unknown, right: unknown): boolean => {
  // AceBase intentionally uses abstract equality here, including the language's
  // object-to-primitive conversion rules.
  // biome-ignore lint/suspicious/noDoubleEquals: parity with AceBase 1.29.13
  return left == right;
};

const tieBreakByPath = (a: SnapshotEntry, b: SnapshotEntry): number => {
  if (a.path === b.path) {
    return 0;
  }

  return a.path < b.path ? -1 : 1;
};

const compareNulls = (
  left: unknown,
  right: unknown,
  ascending: boolean
): number | undefined => {
  if (left !== null && right !== null) {
    return undefined;
  }
  if (left === right) {
    return 0;
  }

  return (left === null) === ascending ? -1 : 1;
};

// Exact port of the native single-key comparator (query.js sortMatches): null
// sorts first ascending and last descending, loosely equal values tie-break by
// snapshot path, and remaining pairs order through JS `<` — cross-type numeric
// coercions included. Both-null pairs return 0, deferring to sort stability
// exactly like the native engine does.
const comparatorFor =
  ({ field, direction }: SortBy) =>
  (a: SnapshotEntry, b: SnapshotEntry): number => {
    const ascending = direction === 'asc';
    const segments = sortKeySegments(field);
    const left = resolveSortValue(a.value, segments);
    const right = resolveSortValue(b.value, segments);
    const nullOrder = compareNulls(left, right, ascending);
    if (nullOrder !== undefined) {
      return nullOrder;
    }
    if (looselyEquals(left, right)) {
      return tieBreakByPath(a, b);
    }

    // The cast keeps runtime behavior identical to native `<` on raw values;
    // TS would otherwise reject relational comparison of unknowns.
    return (left as string) < (right as string) === ascending ? -1 : 1;
  };

export const applySort =
  (config?: SortBy | undefined) =>
  <T extends SnapshotEntry>(entries: ReadonlyArray<T>): Array<T> => {
    if (!config) {
      return [...entries];
    }

    // Native queries start from path order. Establish that stable-sort baseline
    // before the comparator, whose both-null result intentionally remains 0.
    return [...entries].sort(tieBreakByPath).sort(comparatorFor(config));
  };
