import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const root = path.resolve(import.meta.dirname, '..');
const dir = mkdtempSync(path.join(tmpdir(), 'aip-cli-'));
const env = {
  PATH: process.env.PATH ?? '',
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_PATH: path.join(dir, 'cli.db'),
  DEV_API_KEY: 'aip_dev_cli_test_full_key_0000000000',
};

const run = (script: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(root, script), ...args], {
    env,
    encoding: 'utf8',
    timeout: 20_000,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
};

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('CLI', () => {
  it('seeds the database and registers dev keys idempotently', () => {
    const first = run('src/cli/seed.ts');
    expect(first.status).toBe(0);
    expect(first.out).toContain('Seeded 62 companies and 287 contacts');
    expect(first.out).toContain('Registered API key "Development (full access)"');
    expect(run('src/cli/seed.ts').out).toContain('already registered');
  }, 30_000);

  it('creates, lists and revokes keys; the plaintext is shown only at creation', () => {
    const created = run('src/cli/keys.ts', 'create', '--name', 'CI bot', '--scopes', 'companies:read');
    expect(created.status).toBe(0);
    const key = created.out.match(/aip_[A-Za-z0-9_-]{32}/)?.[0];
    const id = created.out.match(/key_[0-9a-f]{12}/)?.[0];
    expect(key).toBeDefined();

    const listed = run('src/cli/keys.ts', 'list');
    expect(listed.out).toContain('CI bot');
    expect(listed.out).not.toContain(key!);

    expect(run('src/cli/keys.ts', 'revoke', id!).out).toContain(`Revoked ${id}`);
    expect(run('src/cli/keys.ts', 'list').out).toMatch(/revoked \d{4}-/);
    expect(run('src/cli/keys.ts', 'revoke', id!).status).toBe(1);
  }, 60_000);

  it('rejects unknown scopes and commands', () => {
    expect(run('src/cli/keys.ts', 'create', '--name', 'x', '--scopes', 'admin:all').out).toContain('unknown scope');
    expect(run('src/cli/keys.ts', 'destroy').status).toBe(1);
  }, 30_000);
});

describe('configuration', () => {
  it('fails fast with a readable message on invalid values', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(/PORT/);
    expect(() => loadConfig({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('requires a real export signing secret in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/EXPORT_SIGNING_SECRET/);
    expect(loadConfig({ NODE_ENV: 'production', EXPORT_SIGNING_SECRET: 'x'.repeat(40) }).env).toBe('production');
  });

  it('derives the public URL from the port and resolves paths from the project root', () => {
    const config = loadConfig({ PORT: '4321', DATABASE_PATH: './data/x.db' });
    expect(config.http.publicBaseUrl).toBe('http://localhost:4321');
    expect(config.databasePath).toBe(path.join(root, 'data/x.db'));
  });
});
