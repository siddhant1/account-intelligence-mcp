import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ApiKeyService } from '../src/auth/apiKeyService.js';
import { READ_ONLY_SCOPES } from '../src/auth/scopes.js';
import { openDatabase } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed/seed.js';
import { systemClock } from '../src/domain/clock.js';
import { ApiKeyRepository } from '../src/repositories/apiKeyRepository.js';

const dir = mkdtempSync(path.join(tmpdir(), 'aip-stdio-'));
const databasePath = path.join(dir, 'test.db');
const db = openDatabase(databasePath);
seedDatabase(db);
const { key } = new ApiKeyService(new ApiKeyRepository(db), systemClock).create({ name: 'stdio', scopes: READ_ONLY_SCOPES });
db.close();

const entrypoint = path.resolve(import.meta.dirname, '../src/stdio.ts');
const baseEnv = { PATH: process.env.PATH ?? '', NODE_ENV: 'test', LOG_LEVEL: 'error', LOG_PRETTY: 'false', DATABASE_PATH: databasePath };

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('stdio transport', () => {
  it('refuses to start without a valid API key', () => {
    for (const apiKey of [undefined, 'aip_wrong_wrong_wrong_wrong_wrong']) {
      const env = apiKey ? { ...baseEnv, ACCOUNT_INTEL_API_KEY: apiKey } : baseEnv;
      const result = spawnSync(process.execPath, ['--import', 'tsx', entrypoint], { env, encoding: 'utf8', timeout: 20_000 });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe(''); // stdout is reserved for the protocol
      expect(result.stderr).toContain('Refusing to start');
    }
  }, 30_000);

  it('serves the tools allowed by the key', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', entrypoint],
      env: { ...baseEnv, ACCOUNT_INTEL_API_KEY: key },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'stdio-test', version: '1.0.0' });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['search_companies', 'get_company', 'search_contacts']);
    const result = await client.callTool({ name: 'get_company', arguments: { companyId: 'cmp_2' } });
    expect(result.structuredContent).toMatchObject({ name: 'Kookaburra AI' });
    await client.close();
  }, 30_000);
});
