/** biome-ignore-all lint/suspicious/noExplicitAny: ignore */
import type { AceBase } from 'acebase';
import type { BetterAuthDBSchema } from 'better-auth';
import type { CleanedWhere } from 'better-auth/adapters';
import { createIndexesFromSchema } from './create-index';
import type { CreatorConfig } from './join';
import { findOne } from './query';
import { decodeMarkerToNull, encodeNullToMarker } from './utils';
import { buildQuery } from './where';

type CreateParams = {
  model: string;
  data: any;
};

export const create =
  (db: AceBase) =>
  async ({ model, data }: CreateParams) => {
    const id = data.id ?? crypto.randomUUID();
    await db.ref(`${model}/${id}`).set(encodeNullToMarker({ ...data, id }));

    return { ...data, id };
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
  update: any;
};

export const update =
  (db: AceBase) =>
  (creatorConfig: CreatorConfig) =>
  async ({ model, where, update }: UpdateParams) => {
    const result = await findOne(db)(creatorConfig)({ model, where });

    if (result?.id) {
      const ref = await db.ref(`${model}/${result.id}`).update(encodeNullToMarker(update));
      const updated = await ref.get();

      return decodeMarkerToNull(updated.val()) as any;
    }

    return null;
  };

export const updateMany =
  (db: AceBase) =>
  async ({ model, where, update }: UpdateParams) => {
    const queries = buildQuery(db)(model)(where);
    const refs = await Promise.all(queries.map((q) => q.find()));
    const updated = await Promise.all(
      refs.flat().map((r) => r.update(encodeNullToMarker(update)))
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
