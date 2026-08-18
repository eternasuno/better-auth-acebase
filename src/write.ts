import type { AceBase } from 'acebase';
import type { BetterAuthDBSchema } from 'better-auth';
import type { CleanedWhere } from 'better-auth/adapters';
import { createIndexesFromSchema } from './create-index.ts';
import type { CreatorConfig } from './join.ts';
import { findOne } from './query.ts';
import type { Value } from './utils.ts';
import { buildQuery } from './where.ts';

type CreateParams<T extends Value = Value> = {
  model: string;
  data: T;
};

export const create =
  (db: AceBase) =>
  async <T extends Value>({ model, data }: CreateParams<T>): Promise<T> => {
    const id = data.id ?? crypto.randomUUID();
    await db.ref(`${model}/${id}`).set({ ...data, id });

    return { ...data, id } as T;
  };

type RemoveParams = {
  model: string;
  where: Array<CleanedWhere>;
};

export const remove =
  (db: AceBase) =>
  (creatorConfig: CreatorConfig) =>
  async ({ model, where }: RemoveParams) => {
    const result = await findOne(db)(creatorConfig)({ model, where });
    if (result?.id) {
      await db.ref(`${model}/${result.id}`).remove();
    }
  };

export const removeMany =
  (db: AceBase) =>
  async ({ model, where }: RemoveParams) => {
    const queries = buildQuery(db)(model)(where);
    const results = await Promise.all(queries.map((q) => q.remove()));

    return results.flat().filter((r) => r.success).length;
  };

type UpdateParams = {
  model: string;
  where: Array<CleanedWhere>;
  update: unknown;
};

export const update =
  (db: AceBase) =>
  (creatorConfig: CreatorConfig) =>
  async <T>({ model, where, update }: UpdateParams): Promise<T | null> => {
    const result = await findOne(db)(creatorConfig)({ model, where });

    if (result?.id) {
      const ref = await db.ref(`${model}/${result.id}`).update(update as Record<string, unknown>);
      const updated = await ref.get();

      return updated.val() as T | null;
    }

    return null;
  };

export const updateMany =
  (db: AceBase) =>
  async ({ model, where, update }: UpdateParams): Promise<number> => {
    const queries = buildQuery(db)(model)(where);
    const refs = await Promise.all(queries.map((q) => q.find()));
    const updated = await Promise.all(
      refs.flat().map((r) => r.update(update as Record<string, unknown>))
    );

    return updated.length;
  };

type CreateSchemaParams = {
  tables: BetterAuthDBSchema;
};

export const createSchema =
  (db: AceBase) =>
  (creatorConfig: CreatorConfig) =>
  async ({ tables }: CreateSchemaParams) => {
    await createIndexesFromSchema(tables)(creatorConfig)(db);

    return { code: '', path: '' };
  };
