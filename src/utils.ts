export const NULL_MARKER =
  '__acebase_null__:v2:1fc8c21f5a3f015e455c7379d0c42e6c';

export const toNullMarker = <T>(value: T): T =>
  (value === null ? NULL_MARKER : value) as T;

export const fromNullMarker = <T>(value: T): T =>
  (value === NULL_MARKER ? null : value) as T;
