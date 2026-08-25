import type { AceBase } from 'acebase';
import type { CleanedWhere, JoinConfig, Where } from 'better-auth/adapters';
import { applyJoin } from './join.ts';
import { applySort, type SnapshotEntry, type SortBy } from './sort.ts';
import {
  applySelect,
  applySlice,
  type CreatorConfig,
  type Value,
} from './utils.ts';
import {
  buildQuery,
  type DataReferenceQuery,
  orGroupCount,
  TAKE_ALL,
} from './where.ts';

type QueryParams = {
  join?: JoinConfig | undefined;
  limit?: number | undefined;
  model: string;
  offset?: number | undefined;
  select?: string[] | undefined;
  sortBy?: SortBy | undefined;
  where?: CleanedWhere[] | undefined;
};

// Snapshots carry their storage path: the merge pipeline needs it for AceBase's
// snapshot-path tie-breaking and identity deduplication.
const fetchSnapshotEntries = async (
  query: DataReferenceQuery
): Promise<Array<SnapshotEntry>> => {
  const snapshots = await query.get();

  // Query snapshots always carry loaded records (the engine skips deleted ones).
  return snapshots.map((snapshot) => ({
    path: snapshot.ref.path,
    value: snapshot.val() as Value,
  }));
};

const fetchAllEntries = async (
  queries: ReadonlyArray<DataReferenceQuery>
): Promise<Array<SnapshotEntry>> => {
  const groups = await Promise.all(queries.map(fetchSnapshotEntries));

  return groups.flat();
};

// OR groups can return the same row; keep the first occurrence per record path.
// The path is the storage identity — record ids may be missing or remapped, so
// deduplicating on them could merge distinct rows or keep duplicates.
const dedupeByPath = (
  entries: ReadonlyArray<SnapshotEntry>
): Array<SnapshotEntry> => {
  const seen = new Set<string>();

  return entries.filter(({ path }) => {
    if (seen.has(path)) {
      return false;
    }

    seen.add(path);

    return true;
  });
};

type WindowParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  sortBy?: SortBy | undefined;
};

const withTakeAll = (query: DataReferenceQuery): DataReferenceQuery =>
  query.take(TAKE_ALL);

// Sort/skip/take pushdown for a single OR group.
const withNativeWindow =
  ({ limit, offset, sortBy }: WindowParams) =>
  (source: DataReferenceQuery): DataReferenceQuery => {
    let query = source;
    if (sortBy) {
      query = query.sort(sortBy.field, sortBy.direction === 'asc');
    }

    if (offset) {
      query = query.skip(offset);
    }

    if (limit !== undefined) {
      query = query.take(limit);
    }

    return query;
  };

type MergeParams = WindowParams & {
  creatorConfig: CreatorConfig;
  join?: JoinConfig | undefined;
  model: string;
  select?: string[] | undefined;
};

// Overlapping OR groups require complete result sets, so their snapshots are merged
// in memory: path-dedupe -> sort (native semantics, ties broken by path) -> slice ->
// join -> select. Sorting with native semantics keeps this path's order identical to a
// single-group query, which AceBase sorts natively.
const mergeOrGroupSnapshots =
  (db: AceBase) =>
  async (
    { creatorConfig, join, limit, model, offset, select, sortBy }: MergeParams,
    queries: ReadonlyArray<DataReferenceQuery>
  ): Promise<Value[]> => {
    const sorted = applySort(sortBy)(
      dedupeByPath(await fetchAllEntries(queries))
    );

    const sliced = applySlice({ limit, offset })(sorted);
    const joined = await applyJoin(db)({ creatorConfig, joinConfig: join })(
      sliced.map((entry) => entry.value)
    );

    return applySelect({ creatorConfig, model, select })(joined);
  };

export const findMany =
  (db: AceBase) =>
  (creatorConfig: CreatorConfig) =>
  async <T = Value>({
    join,
    limit,
    model,
    offset,
    select,
    sortBy,
    where,
  }: QueryParams): Promise<T[]> => {
    if (limit === 0) {
      return [];
    }

    // Sort/skip/take are pushed down natively only for a single OR group: overlapping OR groups
    // require path-deduplication across complete result sets, and ordering across separately
    // fetched groups is undefined, so multiple groups must be merged and sliced in memory.
    const queries = buildQuery(db)(model)(where).map(withTakeAll);
    const singleQuery = queries.at(0);
    if (!singleQuery) {
      return [];
    }

    if (queries.length <= 1) {
      const shots = await withNativeWindow({ limit, offset, sortBy })(
        singleQuery
      ).get();
      const joined = await applyJoin(db)({ creatorConfig, joinConfig: join })(
        shots.getValues()
      );

      return applySelect({ creatorConfig, model, select })(joined) as T[];
    }

    const merged = await mergeOrGroupSnapshots(db)(
      { creatorConfig, join, limit, model, offset, select, sortBy },
      queries
    );

    return merged as T[];
  };

type QueryOneParams = {
  join?: JoinConfig | undefined;
  model: string;
  where?: CleanedWhere[] | undefined;
};

export const findOne =
  (db: AceBase) =>
  (creatorConfig: CreatorConfig) =>
  async <T = Value>({
    join,
    model,
    where,
  }: QueryOneParams): Promise<T | null> => {
    // take(1) pushdown is only safe within a single OR group; with several groups the
    // globally-first match may belong to any group, so the multi-group path must still fetch
    // everything and dedupe before picking the first row.
    const take = orGroupCount(where) <= 1 ? 1 : TAKE_ALL;
    const queries = buildQuery(db)(model)(where).map((query) =>
      query.take(take)
    );
    const results = dedupeByPath(await fetchAllEntries(queries));
    const first = results.at(0)?.value;
    if (first && join) {
      const joined = await applyJoin(db)({ creatorConfig, joinConfig: join })([
        first,
      ]);

      return (joined.at(0) ?? null) as T | null;
    }

    return (first ?? null) as T | null;
  };

type CountParams = {
  model: string;
  where?: Required<Where>[] | undefined;
};

export const count =
  (db: AceBase) =>
  async ({ model, where }: CountParams) => {
    const queries = buildQuery(db)(model)(where).map(withTakeAll);
    if (queries.length <= 1) {
      // Single group: native count is exact and avoids loading any data.
      const counts = await Promise.all(queries.map((q) => q.count()));

      return counts.reduce((a, b) => a + b, 0);
    }

    // Multiple OR groups may overlap: count via path-deduplicated snapshots instead.

    return dedupeByPath(await fetchAllEntries(queries)).length;
  };
