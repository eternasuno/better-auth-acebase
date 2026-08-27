import type { DataSnapshot } from 'acebase';
import type { BetterAuthSortBy } from './types.ts';

const resolveSortValue = (record: unknown, field: string) => {
  if (record === null || typeof record !== 'object') {
    return undefined;
  }

  return (record as Record<string, unknown>)[field];
};

const isMissing = (value: unknown) => value === null || value === undefined;

const compareValues = (left: unknown, right: unknown) => {
  // biome-ignore lint/suspicious/noDoubleEquals: parity with AceBase
  if (left == right) {
    return 0;
  }

  if (isMissing(left)) {
    return -1;
  }

  if (isMissing(right)) {
    return 1;
  }

  return (left as string) < (right as string) ? -1 : 1;
};

export const applySort =
  (sortBy?: BetterAuthSortBy | undefined) =>
  <T>(
    snapshots: ReadonlyArray<DataSnapshot<T>>
  ): ReadonlyArray<DataSnapshot<T>> => {
    if (!sortBy) {
      return snapshots;
    }

    const direction = sortBy.direction === 'asc' ? 1 : -1;
    const sorted = snapshots.toSorted((left, right) =>
      left.ref.path.localeCompare(right.ref.path)
    );

    return sorted.toSorted(
      (left, right) =>
        direction *
        compareValues(
          resolveSortValue(left.val(), sortBy.field),
          resolveSortValue(right.val(), sortBy.field)
        )
    );
  };
