import type { AceBase } from 'acebase';
import type { CleanedWhere } from 'better-auth/adapters';
import { dedupe } from './dedupe.ts';
import { matchesWhere, splitByOrClause, toFilterParams } from './where.ts';

type RemoveParams = {
  limit?: number | undefined;
  model: string;
  where: Array<CleanedWhere>;
};

export const remove =
  (db: AceBase) =>
  async ({
    limit = Number.MAX_SAFE_INTEGER,
    model,
    where = [],
  }: RemoveParams) => {
    const groups = where.length === 0 ? [[]] : splitByOrClause(where);
    const referenceGroups = await Promise.all(
      groups.map((group) =>
        group
          .reduce(
            (query, clause) => query.filter(...toFilterParams(clause)),
            db.query(model).take(limit)
          )
          .find()
      )
    );
    const references = dedupe(referenceGroups.flat()).slice(0, limit);
    const matches = matchesWhere(where);

    let count = 0;
    for (const reference of references) {
      await reference.transaction((snapshot) => {
        const value = snapshot.val();
        if (value !== null && matches(value)) {
          count += 1;
          return null;
        }

        return;
      });
    }

    return count;
  };
