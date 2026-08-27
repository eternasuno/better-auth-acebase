import type { DataReference } from 'acebase';

export const dedupe = (
  references: ReadonlyArray<DataReference>
): ReadonlyArray<DataReference> => {
  const seen = new Set<string>();

  return references.filter((reference) => {
    const path = reference.path;
    if (seen.has(path)) {
      return false;
    }

    seen.add(path);

    return true;
  });
};
