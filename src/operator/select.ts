import type { AceBaseValue, CreatorConfig } from './types.ts';

const selectItem = (fields: ReadonlySet<string>) => (item: AceBaseValue) =>
  Object.fromEntries(
    Object.entries(item).filter(([field]) => fields.has(field))
  );

export const applySelect =
  (
    creatorConfig: CreatorConfig,
    model: string,
    select?: ReadonlyArray<string>
  ) =>
  (values: ReadonlyArray<AceBaseValue>): ReadonlyArray<AceBaseValue> => {
    if (!select?.length) {
      return values;
    }

    const fields = new Set(
      select.map((field) => creatorConfig.getFieldName({ field, model }))
    );

    return values.map(selectItem(fields));
  };
