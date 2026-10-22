import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createContainer } from './container.js';
import { createLogger } from './logger.js';
import { createMcpServer } from './mcp/server.js';

/**
 * Entrypoint: MCP over stdio, for clients that launch the server as a local
 * subprocess (e.g. Claude Desktop). The API key comes from the environment and
 * is checked before the server starts; without a valid key it exits.
 */
const config = loadConfig();
const logger = createLogger(config);
const container = createContainer(config, logger);

const auth = container.services.apiKeys.authenticate(process.env.ACCOUNT_INTEL_API_KEY?.trim());
if (!auth.ok) {
  logger.fatal({ reason: auth.reason }, 'Refusing to start: ACCOUNT_INTEL_API_KEY is missing, invalid or revoked');
  container.close();
  process.exit(1);
}

const server = createMcpServer({ services: container.services, principal: auth.principal, logger });
await server.connect(new StdioServerTransport());
logger.info({ apiKeyId: auth.principal.apiKeyId, scopes: auth.principal.scopes }, 'MCP stdio server ready');

const shutdown = async () => {
  await server.close();
  container.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
