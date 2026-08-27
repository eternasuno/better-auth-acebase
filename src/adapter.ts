import type { AceBase } from 'acebase';
import type { BetterAuthOptions } from 'better-auth';
import {
  type AdapterFactory,
  type AdapterFactoryConfig,
  type AdapterFactoryCustomizeAdapterCreator,
  type CustomAdapter,
  createAdapterFactory,
  type DBAdapter,
} from 'better-auth/adapters';
import { consumeOne } from './operator/consume-one.ts';
import { count } from './operator/count.ts';
import { create } from './operator/create.ts';
import { createIndexesFromSchema } from './operator/create-index.ts';
import { incrementOne } from './operator/increment-one.ts';
import { query } from './operator/query.ts';
import { remove } from './operator/remove.ts';
import { update } from './operator/update.ts';
import { fromNullMarker, toNullMarker } from './utils.ts';

const findOne =
  (
    db: AceBase,
    creatorConfig: Parameters<AdapterFactoryCustomizeAdapterCreator>[0]
  ) =>
  async <T>({
    model,
    where,
    select,
    join,
  }: Parameters<DBAdapter['findOne']>[0]): Promise<T | null> => {
    const values = await query(
      db,
      creatorConfig
    )({
      join: join as never,
      limit: 1,
      model,
      select,
      where: where as never,
    });

    return (values.at(0) as T | undefined) ?? null;
  };

const updateOne =
  (
    db: AceBase,
    creatorConfig: Parameters<AdapterFactoryCustomizeAdapterCreator>[0]
  ) =>
  async <T>({
    model,
    update: changes,
    where,
  }: {
    model: string;
    update: T;
    where: Parameters<DBAdapter['update']>[0]['where'];
  }): Promise<T | null> => {
    const values = await update(
      db,
      creatorConfig
    )({
      limit: 1,
      model,
      update: changes,
      where: where as never,
    });

    return (values.at(0) as T | undefined) ?? null;
  };

const createSchema =
  (
    db: AceBase,
    creatorConfig: Parameters<AdapterFactoryCustomizeAdapterCreator>[0]
  ) =>
  async ({
    tables,
  }: Parameters<NonNullable<CustomAdapter['createSchema']>>[0]) => {
    await createIndexesFromSchema(db, creatorConfig)(tables);

    return { code: '', path: '' };
  };

export const createAdapter =
  (db: AceBase): AdapterFactoryCustomizeAdapterCreator =>
  (creatorConfig) => ({
    count: count(db),
    create: create(db, creatorConfig),
    createSchema: createSchema(db, creatorConfig),
    delete: async ({ model, where }) => {
      await remove(db)({ limit: 1, model, where });
    },
    deleteMany: remove(db),
    consumeOne: consumeOne(db),
    findMany: async <T>(params: Parameters<DBAdapter['findMany']>[0]) =>
      Array.from(await query(db, creatorConfig)(params as never)) as T[],
    incrementOne: incrementOne(db),
    findOne: findOne(db, creatorConfig),
    update: updateOne(db, creatorConfig),
    updateMany: async (params: Parameters<DBAdapter['updateMany']>[0]) =>
      (await update(db, creatorConfig)(params as never)).length,
  });

export type AceBaseAdapterConfig = {
  db: AceBase;
  usePlural?: boolean;
  debugLogs?: boolean;
};

const makeConfig = (config: AceBaseAdapterConfig): AdapterFactoryConfig => ({
  adapterId: 'acebase' as const,
  adapterName: 'AceBase Adapter',
  debugLogs: config.debugLogs ?? false,
  customTransformInput: ({ data }) => toNullMarker(data),
  customTransformOutput: ({ data }) => fromNullMarker(data),
  supportsArrays: false,
  supportsDates: false,
  supportsJSON: false,
  supportsNumericIds: false,
  supportsUUIDs: false,
  transaction: false,
  usePlural: config.usePlural ?? false,
});

export const acebaseAdapter = (
  config: AceBaseAdapterConfig
): AdapterFactory<BetterAuthOptions> =>
  createAdapterFactory({
    adapter: createAdapter(config.db),
    config: makeConfig(config),
  });
