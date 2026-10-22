import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Principal } from '../auth/scopes.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware; the MCP transport forwards it to tool handlers. */
      auth?: AuthInfo;
      principal?: Principal;
      requestId?: string;
    }
  }
}

export {};
