import type { AceBase, DataSnapshotsArray } from 'acebase';
import type { JoinConfig } from 'better-auth';
import type { AdapterFactoryCustomizeAdapterCreator } from 'better-auth/adapters';
import type { Value } from './utils.ts';

export type CreatorConfig = Parameters<AdapterFactoryCustomizeAdapterCreator>[0];

type JoinParams = {
  creatorConfig: CreatorConfig;
  joinConfig?: JoinConfig;
};

type JoinEntry = {
  model: string;
  config: JoinConfig[string];
};

const excute =
  ({ model, config }: JoinEntry) =>
  <T extends Value>(values: Array<T>) =>
  (db: AceBase) => {
    const foreignKeys = [...new Set(values.map((v) => v[config.on.from]))];

    return db
      .query(model)
      .filter(config.on.to, 'in', foreignKeys)
      .take(config.limit ?? 100)
      .get();
  };

const merge =
  ({ model, config }: JoinEntry) =>
  <T extends Value>(values: Array<T>) =>
  (shots: DataSnapshotsArray) => {
    const joinValues = shots.getValues();
    const joinMap = new Map<string, typeof joinValues>();
    for (const jv of joinValues) {
      const key = jv[config.on.to] as string;
      const value = joinMap.get(key) ?? [];
      value.push(jv);
      joinMap.set(key, value);
    }

    return values.map((v) => {
      const valueArr = joinMap.get(v[config.on.from] as string) ?? [];

      return config.relation === 'one-to-one' && valueArr.length > 0
        ? { ...v, [model]: valueArr[0] }
        : { ...v, [model]: valueArr };
    });
  };

export const applyJoin =
  (db: AceBase) =>
  ({ joinConfig, creatorConfig: { getModelName } }: JoinParams) =>
  async <T extends Value>(values: Array<T>) => {
    let results = values;
    for (const [modelKey, config] of Object.entries(joinConfig ?? {})) {
      const model = getModelName(modelKey);
      const entry = { config, model };
      const shots = await excute(entry)(results)(db);
      results = merge(entry)(results)(shots);
    }

    return results;
  };
