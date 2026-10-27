import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createTestContainer, startHttpServer } from './helpers.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
const LIST_TOOLS = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

async function connect(baseUrl: string, headers: Record<string, string>) {
  const client = new Client({ name: 'http-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers } }));
  return client;
}

describe('HTTP transport', () => {
  const context = createTestContainer({ RATE_LIMIT_MAX: '25', AUTH_FAILURE_LIMIT: '100' });
  let http: Awaited<ReturnType<typeof startHttpServer>>;

  beforeAll(async () => {
    http = await startHttpServer(context);
  });
  afterAll(() => http.close());

  describe('authentication', () => {
    it('rejects requests without an API key with 401 and a Bearer challenge', async () => {
      const res = await fetch(`${http.baseUrl}/mcp`, { method: 'POST', headers: JSON_HEADERS, body: LIST_TOOLS });
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Bearer realm="account-intelligence-mcp"');
      expect(await res.json()).toMatchObject({ jsonrpc: '2.0', error: { code: -32001 } });
    });

    it('rejects unknown keys with invalid_token', async () => {
      const res = await fetch(`${http.baseUrl}/mcp`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, Authorization: 'Bearer aip_this_key_does_not_exist_000000' },
        body: LIST_TOOLS,
      });
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"');
    });

    it('makes the SDK client fail to connect without a key', async () => {
      const attempt = connect(http.baseUrl, {});
      await expect(attempt).rejects.toBeInstanceOf(StreamableHTTPError);
      await expect(attempt).rejects.toMatchObject({ code: 401 });
    });

    it('accepts Authorization: Bearer and X-API-Key', async () => {
      const variants: Record<string, string>[] = [
        { Authorization: `Bearer ${context.keys.full}` },
        { 'X-API-Key': context.keys.full },
      ];
      for (const headers of variants) {
        const client = await connect(http.baseUrl, headers);
        expect((await client.listTools()).tools).toHaveLength(5);
        await client.close();
      }
    });

    it('rejects a key once it is revoked', async () => {
      const { record, key } = context.container.services.apiKeys.create({ name: 'temp', scopes: ['companies:read'] });
      const client = await connect(http.baseUrl, { Authorization: `Bearer ${key}` });
      await client.close();

      context.container.services.apiKeys.revoke(record.id);
      await expect(connect(http.baseUrl, { Authorization: `Bearer ${key}` })).rejects.toMatchObject({ code: 401 });
    });
  });

  describe('export downloads', () => {
    let downloadUrl: string;

    beforeAll(async () => {
      const client = await connect(http.baseUrl, { 'X-API-Key': context.keys.full });
      const result = await client.callTool({
        name: 'export_contacts',
        arguments: { contactIds: ['cnt_1', 'cnt_2', 'cnt_1'] },
      });
      await client.close();
      // The test container signs URLs for PUBLIC_BASE_URL; point them at the ephemeral test port.
      const url = new URL((result.structuredContent as { downloadUrl: string }).downloadUrl);
      downloadUrl = `${http.baseUrl}${url.pathname}${url.search}`;
    });

    it('serves the CSV through the signed link without an API key', async () => {
      const res = await fetch(downloadUrl);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="contacts-.+\.csv"$/);
      const lines = (await res.text()).trim().split('\r\n');
      expect(lines[0]).toMatch(/^contact_id,full_name,/);
      expect(lines).toHaveLength(3); // header + 2 unique contacts
    });

    it('rejects tampered signatures and expiry times', async () => {
      const url = new URL(downloadUrl);
      url.searchParams.set('expires', String(Number(url.searchParams.get('expires')) + 3600));
      expect((await fetch(url)).status).toBe(403);
      url.searchParams.delete('signature');
      expect((await fetch(url)).status).toBe(403);
    });
  });

  it('rejects disallowed Host headers (DNS-rebinding protection)', async () => {
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${http.baseUrl}/health`, { headers: { Host: 'evil.example' } }, (res) =>
        resolve(res.statusCode!),
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });

  it('returns a JSON-RPC parse error for malformed bodies', async () => {
    const res = await fetch(`${http.baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, 'X-API-Key': context.keys.full },
      body: '{"jsonrpc": ',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: -32700 } });
  });

  it('enforces the per-key rate limit with 429 and Retry-After', async () => {
    const ping = () =>
      fetch(`${http.baseUrl}/mcp`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'X-API-Key': context.keys.readOnly },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });
    const statuses = (await Promise.all(Array.from({ length: 30 }, ping))).map((res) => res.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(25);

    const limited = await ping();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(limited.headers.get('ratelimit-policy')).toContain('25');
  });
});

describe('failed-authentication throttling', () => {
  const context = createTestContainer({ AUTH_FAILURE_LIMIT: '3' });

  it('blocks an IP after repeated bad keys, even if it then sends a valid key', async () => {
    const http = await startHttpServer(context);
    const post = (key: string) =>
      fetch(`${http.baseUrl}/mcp`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'X-API-Key': key },
        body: LIST_TOOLS,
      });

    for (let attempt = 0; attempt < 3; attempt++)
      expect((await post('aip_guess_guess_guess_guess_00')).status).toBe(401);
    const blocked = await post(context.keys.full);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    await http.close();
  });
});
