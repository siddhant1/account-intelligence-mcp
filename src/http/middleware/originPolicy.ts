import type { RequestHandler } from 'express';
import { jsonRpcError, RpcErrorCode } from '../jsonRpc.js';

const ALLOWED_HEADERS = [
  'Authorization',
  'X-API-Key',
  'Content-Type',
  'Accept',
  'Mcp-Protocol-Version',
  'Mcp-Session-Id',
  'Last-Event-ID',
  'X-Request-Id',
].join(', ');

const EXPOSED_HEADERS = [
  'Mcp-Session-Id',
  'WWW-Authenticate',
  'Retry-After',
  'RateLimit',
  'RateLimit-Policy',
  'X-Request-Id',
].join(', ');

/**
 * The MCP spec requires servers to validate the `Origin` header, so that a web
 * page cannot drive a local server from the user's browser. Requests without
 * an Origin (desktop apps, CLIs, server-to-server) are unaffected. Browser
 * requests must come from an origin whose host is in `allowedHosts`
 * (localhost by default) or that is listed in `allowedOrigins`; those also get
 * CORS headers so browser-based MCP clients can connect. Anything else is 403.
 */
export function originPolicy(config: {
  allowedHosts: readonly string[];
  allowedOrigins: readonly string[];
}): RequestHandler {
  const isAllowed = (origin: string) => {
    try {
      const url = new URL(origin);
      return config.allowedOrigins.includes(url.origin) || config.allowedHosts.includes(url.hostname);
    } catch {
      return false; // includes the opaque "null" origin of sandboxed frames and file:// pages
    }
  };

  return (req, res, next) => {
    const origin = req.get('origin');
    if (!origin) {
      next();
      return;
    }
    if (!isAllowed(origin)) {
      res.status(403).json(jsonRpcError(RpcErrorCode.SERVER_ERROR, `Origin not allowed: ${origin}`));
      return;
    }

    res.vary('Origin');
    res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': EXPOSED_HEADERS });
    if (req.method === 'OPTIONS') {
      res
        .set({
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': ALLOWED_HEADERS,
          'Access-Control-Max-Age': '600',
        })
        .status(204)
        .end();
      return;
    }
    next();
  };
}
