import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContainer, startHttpServer } from './helpers.js';

/** HTTP-level regression and adversarial tests from the audit. */

const ACCEPT = 'application/json, text/event-stream';

/** The fields these tests read from the various tools' structured results. */
interface ToolResult {
  isError?: boolean;
  content: { text: string }[];
  structuredContent: { results: unknown[]; total: number; name: string; contactCount: number; downloadUrl: string };
}

describe('HTTP hardening', () => {
  let now = new Date('2026-03-01T10:00:00Z');
  const context = createTestContainer(
    { ALLOWED_ORIGINS: 'https://inspector.example.com', EXPORT_URL_TTL_SECONDS: '60', RATE_LIMIT_MAX: '1000' },
    { clock: () => now },
  );
  let http: Awaited<ReturnType<typeof startHttpServer>>;

  const rpc = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${http.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: ACCEPT, 'X-API-Key': context.keys.full, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const call = async (name: string, args: unknown) => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    return (await res.json()) as { result: ToolResult };
  };

  beforeAll(async () => {
    http = await startHttpServer(context);
  });
  afterAll(() => http.close());

  describe('Origin validation and CORS', () => {
    it('rejects browser requests from unknown origins (MCP spec requirement)', async () => {
      const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { Origin: 'https://evil.example' });
      expect(res.status).toBe(403);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('rejects the opaque "null" origin', async () => {
      expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { Origin: 'null' })).status).toBe(403);
    });

    it('answers CORS preflight for localhost and configured origins without an API key', async () => {
      for (const origin of ['http://localhost:6274', 'https://inspector.example.com']) {
        const res = await fetch(`${http.baseUrl}/mcp`, {
          method: 'OPTIONS',
          headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get('access-control-allow-origin')).toBe(origin);
        expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
      }
    });

    it('lets allowed browser origins call the server and read auth headers', async () => {
      const ok = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { Origin: 'http://127.0.0.1:5173' });
      expect(ok.status).toBe(200);
      expect(ok.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');

      const unauthenticated = await rpc(
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { Origin: 'http://localhost:6274', 'X-API-Key': '' },
      );
      expect(unauthenticated.status).toBe(401);
      expect(unauthenticated.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
    });

    it('does not affect clients that send no Origin', async () => {
      expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(200);
    });
  });

  describe('export links', () => {
    it('stop working once they expire (410)', async () => {
      const { result } = await call('export_contacts', { contactIds: ['cnt_1'] });
      const url = new URL(result.structuredContent.downloadUrl);
      const local = `${http.baseUrl}${url.pathname}${url.search}`;
      expect((await fetch(local)).status).toBe(200);
      now = new Date(now.getTime() + 61_000);
      const expired = await fetch(local);
      expect(expired.status).toBe(410);
      expect(((await expired.json()) as { error: { code: string } }).error.code).toBe('EXPIRED');
    });
  });

  describe('protocol edge cases', () => {
    it('returns JSON-RPC errors for unknown methods and invalid messages', async () => {
      const unknown = await rpc({ jsonrpc: '2.0', id: 7, method: 'foo/bar' });
      expect(await unknown.json()).toMatchObject({ id: 7, error: { code: -32601 } });
      expect((await rpc({ hello: 'world' })).status).toBe(400);
    });

    it('accepts notifications with 202 and no body', async () => {
      const res = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
      expect(res.status).toBe(202);
      expect(await res.text()).toBe('');
    });

    it('enforces the transport rules for Accept, Content-Type, protocol version and body size', async () => {
      const ping = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
      expect((await rpc(ping, { Accept: 'application/json' })).status).toBe(406);
      expect((await rpc(ping, { 'Content-Type': 'text/plain' })).status).toBe(415);
      expect((await rpc(ping, { 'MCP-Protocol-Version': '1999-01-01' })).status).toBe(400);
      const huge = { jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(300_000) } };
      expect((await rpc(huge)).status).toBe(413);
    });

    it('returns 405 for GET and DELETE on the stateless endpoint', async () => {
      for (const method of ['GET', 'DELETE']) {
        const res = await fetch(`${http.baseUrl}/mcp`, { method, headers: { 'X-API-Key': context.keys.full } });
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('POST');
      }
    });
  });

  describe('hostile and malformed tool input', () => {
    it.each([
      ['SQL injection', { query: "' OR 1=1; DROP TABLE companies; --" }],
      ['FTS5 operators', { query: 'AI NEAR/2 * OR "' }],
      ['emoji and CJK', { query: '🤖 人工智能' }],
      ['only filler words', { query: 'the companies in' }],
    ])('search_companies survives %s', async (_label, args) => {
      const { result } = await call('search_companies', args);
      expect(result.isError).toBeFalsy();
      expect(Array.isArray(result.structuredContent.results)).toBe(true);
    });

    it('still has all companies after the injection attempt', async () => {
      expect((await call('search_companies', { limit: 1 })).result.structuredContent.total).toBe(62);
    });

    it.each([
      ['a string limit', 'search_companies', { limit: '10' }],
      ['a fractional limit', 'search_companies', { limit: 2.5 }],
      ['a null country', 'search_companies', { country: null }],
      ['an oversized query', 'search_companies', { query: 'a'.repeat(1000) }],
      ['a missing required argument', 'get_company', {}],
      ['an uppercase ID', 'get_company', { companyId: 'CMP_2' }],
      ['an empty export', 'export_contacts', { contactIds: [] }],
      ['1001 export IDs', 'export_contacts', { contactIds: Array.from({ length: 1001 }, (_, i) => `cnt_${i + 1}`) }],
      ['an unknown export format', 'export_contacts', { contactIds: ['cnt_1'], format: 'xlsx' }],
      ['an unknown tool', 'delete_everything', {}],
    ])('rejects %s as a readable tool error', async (_label, name, args) => {
      const { result } = await call(name, args);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text.length).toBeGreaterThan(10);
    });

    it('ignores unknown extra arguments and trims IDs', async () => {
      const { result } = await call('get_company', { companyId: '  cmp_2 ', extra: true });
      expect(result.structuredContent.name).toBe('Kookaburra AI');
    });

    it('exports the maximum of 1000 IDs, deduplicated', async () => {
      const ids = Array.from({ length: 1000 }, (_, i) => `cnt_${(i % 287) + 1}`);
      const { result } = await call('export_contacts', { contactIds: ids });
      expect(result.structuredContent.contactCount).toBe(287);
    });
  });
});
