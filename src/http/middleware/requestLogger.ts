import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from '../../logger.js';

const REQUEST_ID_PATTERN = /^[\w.-]{1,64}$/;

interface JsonRpcBody {
  method?: unknown;
  params?: { name?: unknown };
}

/**
 * Assigns a request ID (honouring a well-formed incoming `X-Request-Id`) and
 * writes one structured access-log line per request. The query string is never
 * logged because signed download URLs carry their signature there.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);

    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const body = (req.body ?? {}) as JsonRpcBody;
      // 405 is expected: MCP clients probe GET /mcp for an optional SSE stream, which a stateless server declines.
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 && res.statusCode !== 405 ? 'warn' : 'info';
      logger[level](
        {
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
          apiKeyId: req.principal?.apiKeyId,
          rpcMethod: typeof body.method === 'string' ? body.method : undefined,
          tool: typeof body.params?.name === 'string' ? body.params.name : undefined,
        },
        'request completed',
      );
    });
    next();
  };
}
