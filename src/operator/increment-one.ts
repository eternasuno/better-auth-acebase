import type { AceBase } from 'acebase';
import type { CleanedWhere } from 'better-auth/adapters';
import { dedupe } from './dedupe.ts';
import { matchesWhere, splitByOrClause, toFilterParams } from './where.ts';

type IncrementOneParams = {
  increment: Record<string, number>;
  model: string;
  set?: Record<string, unknown> | undefined;
  where: Array<CleanedWhere>;
};

export const incrementOne =
  (db: AceBase) =>
  async <T>({
    increment,
    model,
    set,
    where = [],
  }: IncrementOneParams): Promise<T | null> => {
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
      let updated: T | null = null;
      await reference.transaction((snapshot) => {
        const value = snapshot.val<Record<string, unknown>>();
        if (value === null || !matches(value)) {
          return;
        }

        updated = {
          ...value,
          ...Object.fromEntries(
            Object.entries(increment).map(([field, delta]) => [
              field,
              (typeof value[field] === 'number' ? value[field] : 0) + delta,
            ])
          ),
          ...set,
        } as T;

        return updated;
      });

      if (updated !== null) {
        return updated;
      }
    }

    return null;
  };
