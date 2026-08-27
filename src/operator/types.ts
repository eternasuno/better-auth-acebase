import type { AceBase, DataSnapshotsArray } from 'acebase';
import type {
  AdapterFactoryCustomizeAdapterCreator,
  CleanedWhere,
  DBAdapter,
} from 'better-auth/adapters';

export type CreatorConfig =
  Parameters<AdapterFactoryCustomizeAdapterCreator>[0];

export type DataReferenceQuery = ReturnType<AceBase['query']>;

export type AceBaseFilterParams = Parameters<DataReferenceQuery['filter']>;

export type AceBaseValues = ReturnType<DataSnapshotsArray['getValues']>;

export type AceBaseValue = AceBaseValues[number];

export type BetterAuthWhere = Omit<CleanedWhere, 'connector'>;

export type BetterAuthWhereGroup = ReadonlyArray<BetterAuthWhere>;

export type BetterAuthSortBy = NonNullable<
  Parameters<DBAdapter['findMany']>[0]['sortBy']
>;
