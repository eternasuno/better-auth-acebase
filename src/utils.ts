import type { AdapterFactoryCustomizeAdapterCreator } from 'better-auth/adapters';

export type CreatorConfig =
  Parameters<AdapterFactoryCustomizeAdapterCreator>[0];

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
