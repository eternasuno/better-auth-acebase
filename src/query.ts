import type { AceBase } from 'acebase';
import type { CleanedWhere, JoinConfig, Where } from 'better-auth/adapters';
import { applyJoin, type CreatorConfig } from './join.ts';
import { applySelect, applySlice, applySort, type SortBy, type Value } from './utils.ts';
import { buildQuery, orGroupCount, TAKE_ALL } from './where.ts';

type QueryParams = {
  join?: JoinConfig;
  limit?: number;
  model: string;
  offset?: number;
  select?: string[];
  sortBy?: SortBy;
  where?: CleanedWhere[];
};

// OR groups run as separate queries; a row can match several groups.
// Keep the first occurrence per id; records without an id are kept as-is.
const dedupeById = (records: Value[]): Value[] => {
  const seen = new Set<unknown>();

  return records.filter((record) => {
    if (!('id' in record)) {
      return true;
    }
    if (seen.has(record.id)) {
      return false;
    }
    seen.add(record.id);

    return true;
  });
};

export const findMany =
  (db: AceBase) =>
  (creatorConfig: CreatorConfig) =>
  async <T = Value>({
    model,
    where,
    join,
    limit,
    sortBy,
    offset,
    select,
  }: QueryParams): Promise<T[]> => {
    // Sort/skip/take are pushed down natively only for a single OR group: overlapping OR groups
    // require id-deduplication across complete result sets, and ordering across separately
    // fetched groups is undefined, so multiple groups must be merged and sliced in memory.
    const queries = buildQuery(db)(model)(where);
    const singleQuery = queries[0];
    if (!singleQuery) {
      return [];
    }

    if (queries.length <= 1) {
      let query = singleQuery;
      if (sortBy) {
        query = query.sort(sortBy.field, sortBy.direction === 'asc');
      }

      if (offset) {
        query = query.skip(offset);
      }

      if (limit !== undefined) {
        query = query.take(limit);
      }

      let results = (await query.get()).getValues();
      results = await applyJoin(db)({ creatorConfig, joinConfig: join })(results);

      return applySelect({ creatorConfig, model, select })(results) as T[];
    }

    const shotArray = await Promise.all(queries.map(async (q) => q.get()));
    let mergedResults = dedupeById(shotArray.flatMap((s) => s.getValues()));
    mergedResults = applySort(sortBy)(mergedResults);
    mergedResults = applySlice({ limit, offset })(mergedResults);
    mergedResults = await applyJoin(db)({ creatorConfig, joinConfig: join })(mergedResults);

    return applySelect({ creatorConfig, model, select })(mergedResults) as T[];
  };

type QueryOneParams = {
  join?: JoinConfig;
  model: string;
  where?: CleanedWhere[];
};

export const findOne =
  (db: AceBase) =>
  (creatorConfig: CreatorConfig) =>
  async <T = Value>({ model, where, join }: QueryOneParams): Promise<T | null> => {
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
      const joined = await applyJoin(db)({ creatorConfig, joinConfig: join })([first]);

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
