import { hostHeaderValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import express, { type Express } from 'express';
import type { Container } from '../container.js';
import { isSeeded } from '../db/seed/seed.js';
import { SERVER_INFO } from '../mcp/server.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { requestLogger } from './middleware/requestLogger.js';
import { exportsRouter } from './routes/exports.js';
import { mcpRouter } from './routes/mcp.js';

export function createHttpApp(container: Container): Express {
  const { config, logger, db } = container;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.http.trustProxy ? 1 : false);

  // DNS-rebinding protection: reject requests whose Host header is not ours.
  app.use(hostHeaderValidation(config.http.allowedHosts));
  app.use(requestLogger(logger));

  app.get('/health', (_req, res) => {
    const seeded = isSeeded(db);
    res.status(seeded ? 200 : 503).json({
      status: seeded ? 'ok' : 'degraded',
      server: SERVER_INFO,
      database: seeded ? 'ok' : 'empty: run `npm run db:seed`',
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.use('/mcp', mcpRouter(container));
  app.use('/exports', exportsRouter(container));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
