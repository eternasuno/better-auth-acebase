import type { CreatorConfig } from './join';

export type Value = Record<string, unknown>;

export const NULL_MARKER = '__acebase_null__';

export const toNullMarker = <T>(value: T) => (value === null ? NULL_MARKER : value);

export const fromNullMarker = <T>(value: T) => (value === NULL_MARKER ? null : value);

export const encodeNullToMarker = <T extends Value>(data: T) =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toNullMarker(value)])) as T;

export const decodeMarkerToNull = <T extends Value>(data: T) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, fromNullMarker(value)])
  ) as T;

type SliceParams = {
  offset?: number;
  limit?: number;
};

export const applySlice =
  ({ offset = 0, limit = 100 }: SliceParams) =>
  <T extends Value>(values: Array<T>) =>
    values.slice(offset, offset + limit);

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
      result[key] = aliasedSelect.has(key) ? value : undefined;
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

const compare =
  <T>(a: T) =>
  (b: T) => {
    if (a === b) {
      return 0;
    }

    return a > b ? 1 : -1;
  };

export const applySort =
  (config?: SortBy) =>
  <T extends Value>(values: Array<T>) =>
    config
      ? [...values].sort((a, b) => {
          const va = a[config.field] as string;
          const vb = b[config.field] as string;
          const factor = config.direction === 'asc' ? 1 : -1;

          return compare(va)(vb) * factor;
        })
      : values;
