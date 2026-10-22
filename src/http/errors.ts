import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { AppError, type ErrorCode } from '../domain/errors.js';
import type { Logger } from '../logger.js';
import { jsonRpcError, RpcErrorCode } from './jsonRpc.js';

const HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_ARGUMENT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  EXPIRED: 410,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Responds to a non-MCP route with `{ error: { code, message, hint } }` and the matching status. */
export function sendAppError(res: Response, error: AppError): void {
  res.status(HTTP_STATUS[error.code]).json({ error: error.toJSON() });
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found. The MCP endpoint is POST /mcp.' } });
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    if (res.headersSent) return;

    // Malformed JSON or oversized bodies, raised by express.json().
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json(jsonRpcError(RpcErrorCode.PARSE_ERROR, 'Parse error: request body is not valid JSON'));
      return;
    }
    if (error?.type === 'entity.too.large') {
      res.status(413).json(jsonRpcError(RpcErrorCode.INVALID_REQUEST, 'Request body too large'));
      return;
    }
    if (error instanceof AppError) {
      sendAppError(res, error);
      return;
    }

    logger.error({ err: error, requestId: req.requestId }, 'unhandled request error');
    res.status(500).json(jsonRpcError(RpcErrorCode.INTERNAL_ERROR, 'Internal server error'));
  };
}
