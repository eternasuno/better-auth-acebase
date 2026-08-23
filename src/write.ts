import type { AceBase } from 'acebase';
import type { BetterAuthDBSchema } from 'better-auth';
import type { CleanedWhere } from 'better-auth/adapters';
import { createIndexesFromSchema } from './create-index.ts';
import type { CreatorConfig } from './join.ts';
import { findOne } from './query.ts';
import type { Value } from './utils.ts';
import { buildQuery, type DataReferenceQuery } from './where.ts';

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

type DataReference = Awaited<ReturnType<DataReferenceQuery['find']>>[number];

const findDistinctRefs = async (
  queries: ReadonlyArray<DataReferenceQuery>
): Promise<DataReference[]> => {
  const groups = await Promise.all(queries.map((query) => query.find()));
  const paths = new Set<string>();

  return groups.flat().filter((ref) => {
    if (paths.has(ref.path)) {
      return false;
    }
    paths.add(ref.path);

    return true;
  });
};

// Bulk writes keep better-auth's numeric fulfilled-count contract, but silently
// dropping rejections would hide partial failures: any rejection surfaces as an
// AggregateError carrying every cause, after all operations have settled.
export const settleBulkOperations = async (
  operations: ReadonlyArray<Promise<unknown>>
): Promise<number> => {
  const results = await Promise.allSettled(operations);
  const causes = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  );
  if (causes.length > 0) {
    throw new AggregateError(causes, 'Some bulk operations failed');
  }

  return results.length;
};

export const removeMany =
  (db: AceBase) =>
  async ({ model, where }: RemoveParams) => {
    const refs = await findDistinctRefs(buildQuery(db)(model)(where));

    return settleBulkOperations(refs.map((ref) => ref.remove()));
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
      const ref = await db
        .ref(`${model}/${result.id}`)
        .update(update as Record<string, unknown>);
      const updated = await ref.get();

      return updated.val() as T | null;
    }

    return null;
  };

export const updateMany =
  (db: AceBase) =>
  async ({ model, where, update }: UpdateParams): Promise<number> => {
    const refs = await findDistinctRefs(buildQuery(db)(model)(where));

    return settleBulkOperations(
      refs.map((ref) => ref.update(update as Record<string, unknown>))
    );
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
