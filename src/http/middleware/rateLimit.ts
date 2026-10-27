import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import { jsonRpcError, RpcErrorCode } from '../jsonRpc.js';

/**
 * Per-API-key request quota (runs after authentication). Responses carry the
 * IETF `RateLimit` / `RateLimit-Policy` headers so clients can pace themselves,
 * plus `Retry-After` once the quota is exhausted.
 *
 * The in-memory store suits a single instance; with several replicas, plug in
 * a shared store such as `rate-limit-redis`.
 */
export function apiKeyRateLimiter(config: AppConfig['rateLimit'], logger: Logger) {
  return rateLimit({
    windowMs: config.windowMs,
    limit: config.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.principal?.apiKeyId ?? 'anonymous',
    handler: (req, res, _next, options) => {
      logger.warn({ requestId: req.requestId, apiKeyId: req.principal?.apiKeyId }, 'rate limit exceeded');
      res.status(options.statusCode).json(
        jsonRpcError(
          RpcErrorCode.RATE_LIMITED,
          `Rate limit exceeded: ${config.max} requests per ${config.windowMs / 1000}s`,
          {
            retryAfterSeconds: Number(res.getHeader('Retry-After')) || undefined,
          },
        ),
      );
    },
  });
}
