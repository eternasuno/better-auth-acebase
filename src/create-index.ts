import type { AceBase } from 'acebase';
import type { BetterAuthDBSchema } from 'better-auth';
import type { CreatorConfig } from './join.ts';

const fieldIterator = function* (schema: BetterAuthDBSchema) {
  for (const [modelKey, modelSchema] of Object.entries(schema)) {
    const { modelName } = modelSchema;
    for (const [fieldKey, fieldAttr] of Object.entries(modelSchema.fields)) {
      if (fieldAttr.index || fieldAttr.unique) {
        yield [modelName, modelKey, fieldKey];
      }
    }
  }
};

export const createIndexesFromSchema =
  (schema: BetterAuthDBSchema) =>
  ({ getFieldName }: CreatorConfig) =>
  (db: AceBase) =>
    Promise.all(
      fieldIterator(schema).map(async ([modelName, modelKey, fieldKey]) => {
        const fieldName = getFieldName({ field: fieldKey, model: modelKey });
        await db.indexes.create(modelName, fieldName);
      })
    );
