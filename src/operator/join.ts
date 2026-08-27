import type { AceBase } from 'acebase';
import type { JoinConfig } from 'better-auth';
import type { AceBaseValue, AceBaseValues, CreatorConfig } from './types.ts';

const fetchJoinedValues =
  (db: AceBase) =>
  async (
    model: string,
    config: JoinConfig[string],
    keys: ReadonlyArray<unknown>
  ) => {
    const limit = config.limit as number;
    if (limit <= 0 || keys.length === 0) {
      return new Map<string, AceBaseValues>();
    }

    const snapshots = await db
      .query(model)
      .filter(config.on.to, 'in', keys)
      .take(limit)
      .get();
    const byKey = new Map<string, AceBaseValues>();

    for (const value of snapshots.getValues()) {
      const key = String(value[config.on.to]);
      const valuesForKey = byKey.get(key) ?? [];
      if (valuesForKey.length < limit) {
        byKey.set(key, [...valuesForKey, value]);
      }
    }

    return byKey;
  };

export const applyJoin =
  (db: AceBase, { getModelName }: CreatorConfig, join: JoinConfig = {}) =>
  async (values: ReadonlyArray<AceBaseValue>) => {
    let results = [...values];

    for (const [modelKey, config] of Object.entries(join)) {
      const model = getModelName(modelKey);
      const keys = [
        ...new Set(results.map((value) => value[config.on.from])),
      ].filter((key) => key !== undefined && key !== null);
      const byKey = await fetchJoinedValues(db)(model, config, keys);

      results = results.map((value) => {
        const matches = byKey.get(String(value[config.on.from])) ?? [];

        return config.relation === 'one-to-one' && matches.length > 0
          ? { ...value, [model]: matches.at(0) }
          : { ...value, [model]: matches };
      });
    }

    return results;
  };
