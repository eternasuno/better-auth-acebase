/** biome-ignore-all lint/suspicious/noExplicitAny: ignore */
import type { AceBase } from 'acebase';
import type { CleanedWhere, JoinConfig, Where } from 'better-auth/adapters';
import { applyJoin, type CreatorConfig } from './join';
import { applySelect, applySlice, applySort, decodeMarkerToNull, type SortBy } from './utils';
import { buildQuery } from './where';

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
  async ({ model, where, join, limit, sortBy, offset, select }: QueryParams) => {
    const shotArray = await Promise.all(buildQuery(db)(model)(where).map(async (q) => q.get()));
    let results = shotArray.flatMap((s) => s.getValues()).map(decodeMarkerToNull);
    results = applySort(sortBy)(results);
    results = applySlice({ limit, offset })(results);
    results = await applyJoin(db)({ creatorConfig, joinConfig: join })(results);

    return applySelect({ creatorConfig, model, select })(results) as any;
  };

type QueryOneParams = {
  join?: JoinConfig;
  model: string;
  where?: CleanedWhere[];
};

export const findOne =
  (db: AceBase) =>
  (creatorConfig: CreatorConfig) =>
  async ({ model, where, join }: QueryOneParams) => {
    const shotArray = await Promise.all(buildQuery(db)(model)(where).map(async (q) => q.get()));
    const results = shotArray.flatMap((s) => s.getValues()).map(decodeMarkerToNull);
    const first = results.at(0);
    if (first && join) {
      const joined = await applyJoin(db)({ creatorConfig, joinConfig: join })([first]);

      return (joined.at(0) ?? null) as any;
    }

    return (first ?? null) as any;
  };

type CountParams = {
  model: string;
  where?: Required<Where>[] | undefined;
};

export const count =
  (db: AceBase) =>
  (creatorConfig: CreatorConfig) =>
  async ({ model, where }: CountParams) => {
    const results = await findMay(db)(creatorConfig)({ model, where });

    return results.length;
  };
