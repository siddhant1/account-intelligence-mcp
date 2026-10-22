import { loadConfig } from './config.js';
import { createContainer } from './container.js';
import { isSeeded } from './db/seed/seed.js';
import { createHttpApp } from './http/app.js';
import { createLogger } from './logger.js';

/** Entrypoint: MCP over Streamable HTTP at POST /mcp. */
const config = loadConfig();
const logger = createLogger(config);
const container = createContainer(config, logger);

if (!isSeeded(container.db)) {
  logger.warn('Database is empty. Run `npm run db:seed` to load the sample dataset.');
}

const server = createHttpApp(container).listen(config.http.port, config.http.host, () => {
  logger.info(
    { mcpEndpoint: `${config.http.publicBaseUrl}/mcp`, host: config.http.host, port: config.http.port },
    'Account Intelligence MCP server listening',
  );
});

server.on('error', (error: NodeJS.ErrnoException) => {
  const hint = error.code === 'EADDRINUSE' ? `port ${config.http.port} is already in use; set PORT in .env` : undefined;
  logger.fatal({ err: error, hint }, 'HTTP server failed to start');
  container.close();
  setTimeout(() => process.exit(1), 100); // let the async log transport flush
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    container.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
