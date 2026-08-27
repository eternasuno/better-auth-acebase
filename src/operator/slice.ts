type SliceParams = {
  limit?: number | undefined;
  offset?: number | undefined;
};

export const applySlice =
  ({ limit, offset = 0 }: SliceParams) =>
  <T>(values: ReadonlyArray<T>): T[] =>
    limit === undefined
      ? values.slice(offset)
      : values.slice(offset, offset + limit);
