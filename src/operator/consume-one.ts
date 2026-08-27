import type { AceBase } from 'acebase';
import type { CleanedWhere } from 'better-auth/adapters';
import { dedupe } from './dedupe.ts';
import { matchesWhere, splitByOrClause, toFilterParams } from './where.ts';

type ConsumeOneParams = {
  model: string;
  where: Array<CleanedWhere>;
};

export const consumeOne =
  (db: AceBase) =>
  async <T>({ model, where = [] }: ConsumeOneParams): Promise<T | null> => {
    const groups = where.length === 0 ? [[]] : splitByOrClause(where);
    const referenceGroups = await Promise.all(
      groups.map((group) =>
        group
          .reduce(
            (query, clause) => query.filter(...toFilterParams(clause)),
            db.query(model).take(1)
          )
          .find()
      )
    );
    const references = dedupe(referenceGroups.flat()).slice(0, 1);
    const matches = matchesWhere(where);

    for (const reference of references) {
      let consumed: T | null = null;
      await reference.transaction((snapshot) => {
        const value = snapshot.val();
        if (value !== null && matches(value)) {
          consumed = value as T;

          return null;
        }

        return;
      });

      if (consumed !== null) {
        return consumed;
      }
    }

    return null;
  };
