import type { AceBase } from 'acebase';
import type { CustomAdapter } from 'better-auth/adapters';
import type { CreatorConfig } from './types.ts';
import { assertUnique } from './unique.ts';

export const create =
  (db: AceBase, creatorConfig: CreatorConfig): CustomAdapter['create'] =>
  async ({ data, model }) => {
    const { id: existingId } = data;
    const id = existingId ?? crypto.randomUUID();

    await assertUnique(db, creatorConfig)(model, data);
    await db.ref(`${model}/${id}`).set({ ...data, id });

    return { ...data, id };
  };
