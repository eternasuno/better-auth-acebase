import type { AceBase } from 'acebase';
import type { CleanedWhere } from 'better-auth/adapters';
import { dedupe } from './dedupe.ts';
import type { CreatorConfig } from './types.ts';
import { assertUnique } from './unique.ts';
import { matchesWhere, splitByOrClause, toFilterParams } from './where.ts';

type UpdateParams = {
  limit?: number | undefined;
  model: string;
  update: unknown;
  where: Array<CleanedWhere>;
};

export const update =
  (db: AceBase, creatorConfig: CreatorConfig) =>
  async <T>({
    limit = Number.MAX_SAFE_INTEGER,
    model,
    update,
    where = [],
  }: UpdateParams): Promise<Array<T>> => {
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
    const changes = update as Record<string, unknown>;

    const updatedValues: Array<T> = [];
    for (const reference of references) {
      const snapshot = await reference.get();
      const value = snapshot.val();
      if (value !== null && matches(value)) {
        await assertUnique(db, creatorConfig)(
          model,
          {
            ...value,
            ...changes,
          },
          reference.key
        );
      }

      await reference.transaction((latestSnapshot) => {
        const latestValue = latestSnapshot.val();
        if (latestValue !== null && matches(latestValue)) {
          const updated = { ...latestValue, ...changes } as T;
          updatedValues.push(updated);

          return updated;
        }

        return;
      });
    }

    return updatedValues;
  };
