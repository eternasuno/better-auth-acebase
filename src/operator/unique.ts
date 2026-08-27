import type { AceBase } from 'acebase';
import type { BetterAuthDBSchema } from 'better-auth';
import type { CreatorConfig } from './types.ts';

const uniqueFields = (
  schema: BetterAuthDBSchema,
  model: string
): ReadonlyArray<ReadonlyArray<string>> => {
  const table = Object.entries(schema).find(
    ([key, value]) =>
      key === model || value.modelName === model || `${key}s` === model
  )?.[1];
  if (!table) {
    return [];
  }

  const fields = Object.entries(table.fields)
    .filter(([, attribute]) => attribute.unique)
    .map(([field]) => [field]);
  const indexes = (table.indexes ?? [])
    .filter((index) => index.unique)
    .map((index) => index.fields);

  return [...fields, ...indexes];
};

export const assertUnique =
  (db: AceBase, creatorConfig: CreatorConfig) =>
  async (
    model: string,
    value: Record<string, unknown>,
    id?: string
  ): Promise<void> => {
    const tableEntry = Object.entries(creatorConfig.schema).find(
      ([key, value]) =>
        key === model || value.modelName === model || `${key}s` === model
    );
    if (!tableEntry) {
      return;
    }

    const [modelKey] = tableEntry;
    for (const fields of uniqueFields(creatorConfig.schema, model)) {
      let query = db.query(model);
      for (const field of fields) {
        const storedField = creatorConfig.getFieldName({
          field,
          model: modelKey,
        });
        query = query.filter(storedField, '==', value[storedField]);
      }

      const references = await query.take(1).find();
      if (references.some((reference) => reference.key !== id)) {
        throw new Error(`Unique constraint violation on ${model}`);
      }
    }
  };
