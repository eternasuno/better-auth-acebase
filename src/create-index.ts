import type { AceBase } from 'acebase';
import type { BetterAuthDBSchema } from 'better-auth';
import type { CreatorConfig } from './utils.ts';

const fieldIterator = function* (schema: BetterAuthDBSchema) {
  for (const [modelKey, modelSchema] of Object.entries(schema)) {
    const { modelName } = modelSchema;
    for (const [fieldKey, fieldAttr] of Object.entries(modelSchema.fields)) {
      if (fieldAttr.index || fieldAttr.unique) {
        yield [modelName, modelKey, fieldKey] as const;
      }
    }
  }
};

// AceBase indexes lowercase string keys unless created with caseSensitive: true,
// which would make eq / in lookups on indexed fields case-insensitive even when
// better-auth asks for the sensitive (default) mode. Recreate any stale index
// that predates that option so upgrades pick up exact-case matching.
export const createIndexesFromSchema =
  (schema: BetterAuthDBSchema) =>
  ({ getFieldName }: CreatorConfig) =>
  async (db: AceBase) => {
    const indexedFields = [...fieldIterator(schema)];
    if (indexedFields.length === 0) {
      return;
    }

    const existingIndexes = await db.indexes.get();
    await Promise.all(
      indexedFields.map(async ([modelName, modelKey, fieldKey]) => {
        const fieldName = getFieldName({ field: fieldKey, model: modelKey });
        const staleIndex = existingIndexes.find(
          (index) =>
            index.path === modelName &&
            index.key === fieldName &&
            index.caseSensitive !== true
        );
        if (staleIndex) {
          await db.indexes.delete(staleIndex.fileName);
        }

        // db.indexes.create re-exports this call but its inherited options type
        // (acebase-core) omits caseSensitive; the LocalApi signature types it.
        await db.api.createIndex(modelName, fieldName, {
          caseSensitive: true,
        });
      })
    );
  };
