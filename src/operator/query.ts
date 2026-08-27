import type { AceBase } from 'acebase';
import type { CleanedWhere, DBAdapter } from 'better-auth/adapters';
import { dedupe } from './dedupe.ts';
import { applyJoin } from './join.ts';
import { applySelect } from './select.ts';
import { applySlice } from './slice.ts';
import { applySort } from './sort.ts';
import type {
  BetterAuthSortBy,
  BetterAuthWhereGroup,
  CreatorConfig,
} from './types.ts';
import { splitByOrClause, toFilterParams } from './where.ts';

type QueryBaseParams = {
  limit?: number | undefined;
  model: string;
  offset?: number | undefined;
  sortBy?: BetterAuthSortBy | undefined;
};

type QueryWithoutOrParams = QueryBaseParams & {
  where?: BetterAuthWhereGroup | undefined;
};

type QueryWithOrParams = QueryBaseParams & {
  groups: ReadonlyArray<BetterAuthWhereGroup>;
};

export const TAKE_ALL = Number.MAX_SAFE_INTEGER;

const buildQuery =
  (db: AceBase) =>
  ({
    limit = TAKE_ALL,
    offset = 0,
    sortBy,
    model,
    where = [],
  }: QueryWithoutOrParams) => {
    let query = db.query(model);

    for (const clause of where) {
      query = query.filter(...toFilterParams(clause));
    }

    if (sortBy) {
      query = query.sort(sortBy.field, sortBy.direction === 'asc');
    }

    if (offset) {
      query = query.skip(offset);
    }

    return query.take(limit);
  };

const queryWithoutOr =
  (db: AceBase) =>
  async ({ model, limit, offset, sortBy, where }: QueryWithoutOrParams) => {
    const snapshots = await buildQuery(db)({
      model,
      limit,
      offset,
      sortBy,
      where,
    }).get();

    return snapshots.getValues();
  };

const queryWithOr =
  (db: AceBase) =>
  async ({ model, limit, offset, sortBy, groups }: QueryWithOrParams) => {
    if (limit === 0) {
      return [];
    }

    const references = await Promise.all(
      groups.map((where) => buildQuery(db)({ model, where }).find())
    );
    const uniqueReferences = dedupe(references.flat());
    const snapshots = await Promise.all(
      uniqueReferences.map((reference) => reference.get())
    );
    const sorted = applySort(sortBy)(snapshots);

    return applySlice({ limit, offset })(sorted).map((snapshot) =>
      snapshot.val()
    );
  };

export const query =
  (db: AceBase, creatorConfig: CreatorConfig) =>
  async <T>({
    join,
    model,
    select,
    where = [],
    ...window
  }: Parameters<DBAdapter['findMany']>[0]): Promise<ReadonlyArray<T>> => {
    if (window.limit === 0) {
      return [];
    }

    const cleanedWhere = where as ReadonlyArray<CleanedWhere>;
    const groups = splitByOrClause(cleanedWhere);
    const values =
      groups.length <= 1
        ? await queryWithoutOr(db)({ ...window, model, where: cleanedWhere })
        : await queryWithOr(db)({ ...window, model, groups });
    const joined = await applyJoin(db, creatorConfig, join as never)(values);

    return applySelect(
      creatorConfig,
      model,
      select
    )(joined) as ReadonlyArray<T>;
  };
