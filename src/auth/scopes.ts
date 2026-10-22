/**
 * Permission scopes carried by API keys. Each MCP tool requires exactly one;
 * tools a key cannot use are not advertised to that client at all.
 */
export const SCOPES = {
  COMPANIES_READ: 'companies:read',
  CONTACTS_READ: 'contacts:read',
  CONTACTS_ENRICH: 'contacts:enrich',
  CONTACTS_EXPORT: 'contacts:export',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export const ALL_SCOPES: readonly Scope[] = Object.values(SCOPES);
export const READ_ONLY_SCOPES: readonly Scope[] = [SCOPES.COMPANIES_READ, SCOPES.CONTACTS_READ];

export function isScope(value: string): value is Scope {
  return (ALL_SCOPES as readonly string[]).includes(value);
}

/** The authenticated caller, independent of transport. */
export interface Principal {
  apiKeyId: string;
  apiKeyName: string;
  scopes: readonly Scope[];
}

export const hasScope = (principal: Principal, scope: Scope) => principal.scopes.includes(scope);
