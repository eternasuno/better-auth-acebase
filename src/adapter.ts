import type { AceBase } from 'acebase';
import {
  type AdapterFactoryConfig,
  type AdapterFactoryCustomizeAdapterCreator,
  createAdapterFactory,
} from 'better-auth/adapters';
import { count, findMay, findOne } from './query';
import { create, createSchema, remove, removeMany, update, updateMany } from './write';

export const createAdapter =
  (db: AceBase): AdapterFactoryCustomizeAdapterCreator =>
  (creatorConfig) => ({
    count: count(db)(creatorConfig),
    create: create(db),
    createSchema: createSchema(db)(creatorConfig),
    delete: remove(db)(creatorConfig),
    deleteMany: removeMany(db),
    findMany: findMay(db)(creatorConfig),
    findOne: findOne(db)(creatorConfig),
    update: update(db)(creatorConfig),
    updateMany: updateMany(db),
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
  supportsDates: false,
  supportsJSON: true,
  supportsNumericIds: false,
  supportsUUIDs: false,
  usePlural: config.usePlural ?? false,
});

export const acebaseAdapter = (config: AceBaseAdapterConfig) =>
  createAdapterFactory({
    adapter: createAdapter(config.db),
    config: makeConfig(config),
  });
