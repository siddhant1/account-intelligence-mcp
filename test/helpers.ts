import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ALL_SCOPES, READ_ONLY_SCOPES, type Principal } from '../src/auth/scopes.js';
import { loadConfig } from '../src/config.js';
import { createContainer, type ContainerOverrides } from '../src/container.js';
import { openDatabase } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed/seed.js';
import { createHttpApp } from '../src/http/app.js';
import { createLogger } from '../src/logger.js';
import { createMcpServer } from '../src/mcp/server.js';

/** A fully wired container over a fresh, seeded in-memory database, plus one full and one read-only key. */
export function createTestContainer(env: Record<string, string> = {}, overrides: ContainerOverrides = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    LOG_PRETTY: 'false',
    DATABASE_PATH: ':memory:',
    ENRICHMENT_LATENCY_MS: '0',
    PUBLIC_BASE_URL: 'http://localhost:3100',
    ...env,
  });
  const db = openDatabase(':memory:');
  seedDatabase(db);
  const container = createContainer(config, createLogger(config), { db, ...overrides });

  const full = container.services.apiKeys.create({ name: 'test-full', scopes: ALL_SCOPES });
  const readOnly = container.services.apiKeys.create({ name: 'test-readonly', scopes: READ_ONLY_SCOPES });
  const principal = (record: typeof full.record): Principal => ({
    apiKeyId: record.id,
    apiKeyName: record.name,
    scopes: record.scopes,
  });

  return {
    container,
    keys: { full: full.key, readOnly: readOnly.key },
    principals: { full: principal(full.record), readOnly: principal(readOnly.record) },
  };
}

/** Connects an SDK client to the MCP server in-process (no network). */
export async function connectInMemory(context: ReturnType<typeof createTestContainer>, principal: Principal) {
  const { container } = context;
  const server = createMcpServer({ services: container.services, principal, logger: container.logger });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

/** Starts the real HTTP app on an ephemeral port. */
export async function startHttpServer(context: ReturnType<typeof createTestContainer>) {
  const app = createHttpApp(context.container);
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Parses the JSON error payload of a tool error result. */
export function toolError(result: unknown) {
  const { isError, content } = result as { isError?: boolean; content?: { type: string; text: string }[] };
  const [first] = content ?? [];
  return { isError: isError === true, text: first?.text ?? '', json: safeJson(first?.text) };
}

function safeJson(text: string | undefined) {
  try {
    return text ? (JSON.parse(text) as { error?: { code: string; message: string; hint?: string } }) : undefined;
  } catch {
    return undefined;
  }
}
