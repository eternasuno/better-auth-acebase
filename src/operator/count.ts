import type { AceBase } from 'acebase';
import type { CleanedWhere } from 'better-auth/adapters';
import { dedupe } from './dedupe.ts';
import { splitByOrClause, toFilterParams } from './where.ts';

type CountParams = {
  model: string;
  where?: Array<CleanedWhere> | undefined;
};

export const count =
  (db: AceBase) =>
  async ({ model, where = [] }: CountParams): Promise<number> => {
    const groups = where.length === 0 ? [[]] : splitByOrClause(where);
    const queries = groups.map((group) =>
      group.reduce(
        (query, clause) => query.filter(...toFilterParams(clause)),
        db.query(model).take(Number.MAX_SAFE_INTEGER)
      )
    );

    if (queries.length <= 1) {
      return queries.at(0)?.count() ?? 0;
    }

    const referenceGroups = await Promise.all(
      queries.map((query) => query.find())
    );

    return dedupe(referenceGroups.flat()).length;
  };
