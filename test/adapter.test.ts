import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestSuite, normalTestSuite, testAdapter } from '@better-auth/test-utils/adapter';
import { AceBase } from 'acebase';
import { describe } from 'vitest';
import { acebaseAdapter } from '../src/adapter';

describe('AceBase Adapter', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'test-acebase-'));
  const db = new AceBase('test', { logLevel: 'error', storage: { path: tempDir } });
  await db.ready();

  const usePlural = false;
  const adapter = acebaseAdapter({ db, usePlural });

  const { execute } = await testAdapter({
    adapter: () => adapter,
    onFinish: async () => {
      await db.close();
      await rm(tempDir, { recursive: true });
    },
    runMigrations: async (options) => {
      await adapter(options).createSchema?.(options);
    },
    tests: [normalTestSuite(), countRegressionSuite()],
  });

  execute();
});

const countRegressionSuite = createTestSuite(
  'AceBase count regression',
  {},
  ({ adapter, insertRandom }) => ({
    'count returns more than defaultFindManyLimit (100)': async () => {
      await insertRandom('user', 150);
      const count = await adapter.count({ model: 'user' });
      if (count !== 150) {
        throw new Error(`expected 150, got ${count}`);
      }
    },
  })
);
