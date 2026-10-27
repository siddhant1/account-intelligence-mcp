import type { Request, RequestHandler } from 'express';
import type { ApiKeyService, AuthenticationResult } from '../../auth/apiKeyService.js';
import type { Logger } from '../../logger.js';
import { jsonRpcError, RpcErrorCode } from '../jsonRpc.js';
import type { FailedAuthLimiter } from './failedAuthLimiter.js';

const REALM = 'account-intelligence-mcp';

const FAILURE_MESSAGES: Record<Exclude<AuthenticationResult, { ok: true }>['reason'], string> = {
  missing: 'Authentication required: send your API key as "Authorization: Bearer <key>" or "X-API-Key: <key>"',
  malformed: 'Invalid API key',
  unknown: 'Invalid API key',
  revoked: 'API key has been revoked',
};

/** Reads the key from `Authorization: Bearer <key>` (preferred) or `X-API-Key: <key>`. */
export function extractApiKey(req: Request): string | undefined {
  const authorization = req.get('authorization');
  if (authorization) {
    const [scheme, token] = authorization.split(/\s+/, 2);
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }
  return req.get('x-api-key')?.trim() || undefined;
}

/**
 * Rejects requests without a valid, unrevoked API key with 401 and a
 * `WWW-Authenticate` challenge (RFC 6750). On success, attaches the principal
 * and an MCP `AuthInfo` to the request. Repeated failures from one IP are
 * throttled to make key guessing impractical.
 */
export function authenticate(deps: {
  apiKeys: ApiKeyService;
  failedAuth: FailedAuthLimiter;
  logger: Logger;
}): RequestHandler {
  return (req, res, next) => {
    const ip = req.ip ?? 'unknown';

    const retryAfter = deps.failedAuth.retryAfterSeconds(ip);
    if (retryAfter > 0) {
      res
        .status(429)
        .set('Retry-After', String(retryAfter))
        .json(
          jsonRpcError(RpcErrorCode.RATE_LIMITED, 'Too many failed authentication attempts; try again later', {
            retryAfterSeconds: retryAfter,
          }),
        );
      return;
    }

    const key = extractApiKey(req);
    const result = deps.apiKeys.authenticate(key);

    if (!result.ok) {
      deps.failedAuth.recordFailure(ip);
      deps.logger.warn({ requestId: req.requestId, ip, reason: result.reason }, 'authentication failed');
      const challenge =
        result.reason === 'missing' ? `Bearer realm="${REALM}"` : `Bearer realm="${REALM}", error="invalid_token"`;
      res
        .status(401)
        .set('WWW-Authenticate', challenge)
        .json(jsonRpcError(RpcErrorCode.UNAUTHORIZED, FAILURE_MESSAGES[result.reason]));
      return;
    }

    req.principal = result.principal;
    req.auth = {
      token: key!,
      clientId: result.principal.apiKeyId,
      scopes: [...result.principal.scopes],
      extra: { apiKeyName: result.principal.apiKeyName },
    };
    next();
  };
}
