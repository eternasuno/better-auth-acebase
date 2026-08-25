import type { AceBase } from 'acebase';
import type { JoinConfig } from 'better-auth';
import type { CreatorConfig, Value } from './utils.ts';

type JoinParams = {
  creatorConfig: CreatorConfig;
  joinConfig?: JoinConfig | undefined;
};

type JoinEntry = {
  model: string;
  config: JoinConfig[string];
};

// better-auth always sets a numeric limit on join configs
// (defaultFindManyLimit ?? 100; 1 for one-to-one), so take it directly.
// The public JoinConfig type keeps `limit` optional, hence the cast.
const joinTake = (config: JoinConfig[string]) => config.limit as number;

const fetchByKey =
  ({ model, config }: JoinEntry) =>
  (db: AceBase) =>
  async (foreignKey: unknown): Promise<Array<Value>> => {
    const shots = await db
      .query(model)
      .filter(config.on.to, '==', foreignKey)
      .take(joinTake(config))
      .get();

    return shots.getValues();
  };

// One query per distinct parent key so the limit is a per-parent quota,
// mirroring better-auth's Mongo adapter; a single global `in` query would share
// one take() across all parents and starve later keys. Nullish keys are skipped:
// they can never match a stored child (AceBase drops nulls), and querying them
// would be meaningless work.
const foreignKeysOf =
  <T extends Value>(values: Array<T>) =>
  (config: JoinConfig[string]) =>
    [...new Set(values.map((value) => value[config.on.from]))].filter(
      (key) => key !== undefined && key !== null
    );

const execute =
  (entry: JoinEntry) =>
  (db: AceBase) =>
  async <T extends Value>(values: Array<T>): Promise<Array<Value>> => {
    // AceBase's take(0) means unlimited, but better-auth semantics demand zero
    // joined children for limit <= 0, so skip querying entirely.
    if (joinTake(entry.config) <= 0) return [];
    const perKey = await Promise.all(
      foreignKeysOf(values)(entry.config).map(fetchByKey(entry)(db))
    );

    return perKey.flat();
  };

const merge =
  ({ model, config }: JoinEntry) =>
  <T extends Value>(values: Array<T>) =>
  (joinValues: Array<Value>) => {
    const joinMap = new Map<string, Array<Value>>();
    for (const joinValue of joinValues) {
      const key = joinValue[config.on.to] as string;
      const value = joinMap.get(key) ?? [];
      value.push(joinValue);
      joinMap.set(key, value);
    }

    return values.map((value) => {
      const valueArr = joinMap.get(value[config.on.from] as string) ?? [];

      return config.relation === 'one-to-one' && valueArr.length > 0
        ? { ...value, [model]: valueArr[0] }
        : { ...value, [model]: valueArr };
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
      const shots = await execute(entry)(db)(results);
      results = merge(entry)(results)(shots);
    }

    return results;
  };
