import type { AceBase } from 'acebase';
import type { CleanedWhere, JoinConfig, Where } from 'better-auth/adapters';
import { applyJoin, type CreatorConfig } from './join.ts';
import { applySelect, applySlice, applySort, type SortBy, type Value } from './utils.ts';
import { buildQuery } from './where.ts';

type QueryParams = {
  join?: JoinConfig;
  limit?: number;
  model: string;
  offset?: number;
  select?: string[];
  sortBy?: SortBy;
  where?: CleanedWhere[];
};

export const findMay =
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
    const shotArray = await Promise.all(buildQuery(db)(model)(where).map(async (q) => q.get()));
    let results = shotArray.flatMap((s) => s.getValues());
    results = applySort(sortBy)(results);
    results = applySlice({ limit, offset })(results);
    results = await applyJoin(db)({ creatorConfig, joinConfig: join })(results);

    return applySelect({ creatorConfig, model, select })(results) as T[];
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
    const shotArray = await Promise.all(buildQuery(db)(model)(where).map(async (q) => q.get()));
    const results = shotArray.flatMap((s) => s.getValues());
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
    const counts = await Promise.all(queries.map((q) => q.count()));

    return counts.reduce((a, b) => a + b, 0);
  };
