import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Router } from 'express';
import type { Container } from '../../container.js';
import { createMcpServer } from '../../mcp/server.js';
import { jsonRpcError, RpcErrorCode } from '../jsonRpc.js';
import { authenticate } from '../middleware/authenticate.js';
import { FailedAuthLimiter } from '../middleware/failedAuthLimiter.js';
import { apiKeyRateLimiter } from '../middleware/rateLimit.js';

/**
 * Streamable HTTP endpoint in stateless mode: every POST gets a fresh MCP
 * server bound to the caller's API key. There is no session state to share,
 * so instances scale horizontally behind a plain load balancer.
 */
export function mcpRouter({ config, services, logger }: Container): Router {
  const router = Router();

  router.use(
    authenticate({ apiKeys: services.apiKeys, failedAuth: new FailedAuthLimiter(config.rateLimit.authFailureLimit), logger }),
    apiKeyRateLimiter(config.rateLimit, logger),
    express.json({ limit: '256kb' }),
  );

  router.post('/', async (req, res) => {
    const server = createMcpServer({ services, principal: req.principal!, logger });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error({ err: error, requestId: req.requestId }, 'failed to handle MCP request');
      if (!res.headersSent) res.status(500).json(jsonRpcError(RpcErrorCode.INTERNAL_ERROR, 'Internal server error'));
    }
  });

  // Stateless mode has no server-initiated SSE stream (GET) or session to terminate (DELETE).
  router.all('/', (_req, res) => {
    res
      .status(405)
      .set('Allow', 'POST')
      .json(jsonRpcError(RpcErrorCode.SERVER_ERROR, 'Method not allowed: this server is stateless, use POST'));
  });

  return router;
}
