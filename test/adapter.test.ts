import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalTestSuite, testAdapter } from '@better-auth/test-utils/adapter';
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
    tests: [normalTestSuite()],
  });

  execute();
});
