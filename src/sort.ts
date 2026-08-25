import type { Value } from './utils.ts';

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

const resolveSortValue = (record: Value, field: string): unknown =>
  field in record ? record[field] : null;

const tieBreakByPath = (a: SnapshotEntry, b: SnapshotEntry): number => {
  if (a.path === b.path) {
    return 0;
  }

  return a.path < b.path ? -1 : 1;
};

// Equivalent to the native single-key ordering after the path baseline: null
// sorts first ascending and last descending, loosely equal values preserve the
// baseline, and remaining pairs order through JS `<` with numeric coercions.
const compareWithNull = (
  left: unknown,
  right: unknown,
  ascending: boolean
): number => {
  if (left === right) {
    return 0;
  }

  return (left === null) === ascending ? -1 : 1;
};

const comparatorFor =
  ({ field, direction }: SortBy) =>
  (a: SnapshotEntry, b: SnapshotEntry): number => {
    const ascending = direction === 'asc';
    const left = resolveSortValue(a.value, field);
    const right = resolveSortValue(b.value, field);
    if (left === null || right === null) {
      return compareWithNull(left, right, ascending);
    }
    // biome-ignore lint/suspicious/noDoubleEquals: parity with AceBase 1.29.13
    if (left == right) {
      return 0;
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

    // OR groups arrive in clause order, while a native query starts from storage
    // path order. Establish the same stable-sort baseline for null-valued ties.
    return [...entries].sort(tieBreakByPath).sort(comparatorFor(config));
  };
