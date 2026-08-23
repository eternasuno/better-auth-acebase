import type { AceBase } from 'acebase';
import { describe, expect, it } from 'vitest';
import { removeMany, updateMany } from '../src/write';

// Minimal fake of the AceBase surface bulk writes touch: buildQuery chains
// take/filter on a query object, then find() resolves the target refs. Refs are
// plain objects exposing only what write.ts accesses (path + the invoked op).
type FakeRef = {
  path: string;
  remove?: () => Promise<void>;
  update?: (value: unknown) => Promise<void>;
};

const dbOverRefs = (refs: ReadonlyArray<FakeRef>) =>
  ({
    query: () => {
      const chain = {
        take: () => chain,
        filter: () => chain,
        find: async () => refs,
      };

      return chain;
    },
  }) as unknown as AceBase;

const okRef = (path: string, calls: string[]) => ({
  path,
  remove: async () => {
    calls.push(path);
  },
  update: async () => {
    calls.push(path);
  },
});

const failingRef = (path: string, cause: Error): FakeRef => ({
  path,
  remove: async () => {
    throw cause;
  },
  update: async () => {
    throw cause;
  },
});

describe('bulk operations', () => {
  it('count distinct successful refs only once', async () => {
    const calls: string[] = [];
    const db = dbOverRefs([
      okRef('user/a', calls),
      okRef('user/b', calls),
      okRef('user/a', calls),
    ]);

    await expect(removeMany(db)({ model: 'user', where: [] })).resolves.toBe(2);
    await expect(
      updateMany(db)({ model: 'user', where: [], update: { x: 1 } })
    ).resolves.toBe(2);
    expect(calls).toEqual(['user/a', 'user/b', 'user/a', 'user/b']);
  });

  it('aggregate every rejection after all ops settle', async () => {
    const first = new Error('first');
    const second = new Error('second');
    const calls: string[] = [];
    const db = dbOverRefs([
      okRef('user/a', calls),
      failingRef('user/b', first),
      failingRef('user/c', second),
    ]);

    let removalCauses: unknown[] | undefined;
    try {
      await removeMany(db)({ model: 'user', where: [] });
    } catch (error) {
      removalCauses =
        error instanceof AggregateError ? [...error.errors] : undefined;
    }

    expect(removalCauses?.map((cause) => String(cause))).toEqual([
      'Error: first',
      'Error: second',
    ]);
    // All operations ran before rejecting, including ones after a failure.
    expect(calls).toEqual(['user/a']);

    let updateCauses: unknown[] | undefined;
    try {
      await updateMany(db)({ model: 'user', where: [], update: { x: 1 } });
    } catch (error) {
      updateCauses =
        error instanceof AggregateError ? [...error.errors] : undefined;
    }
    expect(updateCauses?.map((cause) => String(cause))).toEqual([
      'Error: first',
      'Error: second',
    ]);
  });
});
