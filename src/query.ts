import type { AceBase } from 'acebase';
import type { CleanedWhere, JoinConfig, Where } from 'better-auth/adapters';
import { applyJoin, type CreatorConfig } from './join.ts';
import {
  applySelect,
  applySlice,
  applySort,
  type SortBy,
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

// OR groups run as separate queries; a row can match several groups.
// Keep the first occurrence per id; records without an id are kept as-is.
const dedupeById = (records: Value[]): Value[] => {
  const seen = new Set<string>();

  return records.filter((record) => {
    const { id } = record;
    if (id === undefined) {
      return true;
    }
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);

    return true;
  });
};

type WindowParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  sortBy?: SortBy | undefined;
};

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
// in memory: id-dedupe -> sort -> slice -> join -> select.
const mergeOrGroupSnapshots =
  (db: AceBase) =>
  async (
    { creatorConfig, join, limit, model, offset, select, sortBy }: MergeParams,
    queries: ReadonlyArray<DataReferenceQuery>
  ): Promise<Value[]> => {
    const shotArray = await Promise.all(queries.map(async (q) => q.get()));
    let merged: Value[] = dedupeById(shotArray.flatMap((s) => s.getValues()));
    merged = applySort(sortBy)(merged);
    merged = applySlice({ limit, offset })(merged);
    merged = await applyJoin(db)({ creatorConfig, joinConfig: join })(merged);

    return applySelect({ creatorConfig, model, select })(merged);
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
    // Sort/skip/take are pushed down natively only for a single OR group: overlapping OR groups
    // require id-deduplication across complete result sets, and ordering across separately
    // fetched groups is undefined, so multiple groups must be merged and sliced in memory.
    const queries = buildQuery(db)(model)(where);
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
    const shotArray = await Promise.all(
      buildQuery(db)(model)(where, take).map(async (q) => q.get())
    );
    const results = dedupeById(shotArray.flatMap((s) => s.getValues()));
    const first = results.at(0);
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
    const queries = buildQuery(db)(model)(where);
    if (queries.length <= 1) {
      // Single group: native count is exact and avoids loading any data.
      const counts = await Promise.all(queries.map((q) => q.count()));

      return counts.reduce((a, b) => a + b, 0);
    }

    // Multiple OR groups may overlap: count via id-deduplicated snapshots instead.
    const shotArray = await Promise.all(queries.map(async (q) => q.get()));

    return dedupeById(shotArray.flatMap((s) => s.getValues())).length;
  };
