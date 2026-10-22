/**
 * JSON-RPC error codes used for HTTP-level rejections on the MCP endpoint.
 * -32000 to -32099 is the range JSON-RPC reserves for implementation-defined server errors.
 */
export const RpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
  UNAUTHORIZED: -32001,
  RATE_LIMITED: -32029,
} as const;

export function jsonRpcError(code: number, message: string, data?: Record<string, unknown>) {
  return { jsonrpc: '2.0' as const, error: { code, message, ...(data ? { data } : {}) }, id: null };
}
