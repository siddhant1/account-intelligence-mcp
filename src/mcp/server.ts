import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { hasScope, SCOPES, type Principal } from '../auth/scopes.js';
import type { Services } from '../container.js';
import { AppError } from '../domain/errors.js';
import type { Logger } from '../logger.js';
import { registerTool } from './registerTool.js';
import { TOOLS } from './tools/index.js';

export const SERVER_INFO = {
  name: 'account-intelligence',
  title: 'Account Intelligence Platform',
  version: '1.0.0',
} as const;

const instructions = (facets: {
  countries: string[];
  industries: string[];
}) => `Account intelligence for B2B prospecting: companies, the people who work there, and their contact details.
Typical workflow:
1. search_companies to find target accounts (free text plus country, industry and headcount filters).
2. get_company for a full profile of a promising account.
3. search_contacts with a companyId and/or jobTitle to find the right people.
4. enrich_contact to reveal a person's email and LinkedIn. Each new lookup uses enrichment credits, so only enrich contacts the user needs.
5. export_contacts to give the user a downloadable CSV/JSON file; share the returned downloadUrl.
IDs look like "cmp_12" (companies) and "cnt_34" (contacts). Never invent IDs: take them from search results.
Errors come back as JSON {"error": {"code", "message", "hint"}}; follow the hint to recover.
Countries in the dataset: ${facets.countries.join(', ')}.
Industries in the dataset: ${facets.industries.join(', ')}.`;

export interface McpServerDependencies {
  services: Services;
  principal: Principal;
  logger: Logger;
}

/**
 * Builds an MCP server for one authenticated principal. Only the tools the
 * principal's scopes allow are registered, so clients never discover tools
 * they cannot call. The server is transport-agnostic (HTTP or stdio).
 */
export function createMcpServer({ services, principal, logger }: McpServerDependencies): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: instructions(services.companies.facets()) });

  for (const tool of TOOLS) {
    if (hasScope(principal, tool.scope)) registerTool(server, tool, { services, principal, logger });
  }

  if (hasScope(principal, SCOPES.COMPANIES_READ)) registerCompanyResources(server, services);
  if (hasScope(principal, SCOPES.COMPANIES_READ) && hasScope(principal, SCOPES.CONTACTS_READ)) {
    registerProspectingPrompt(server, principal);
  }

  return server;
}

/** Exposes each company profile as a JSON resource, e.g. `account-intel://companies/cmp_1`. */
function registerCompanyResources(server: McpServer, services: Services): void {
  const template = new ResourceTemplate('account-intel://companies/{companyId}', {
    list: () => ({
      resources: services.companies.search({ limit: 1000 }).companies.map((company) => ({
        uri: `account-intel://companies/${company.id}`,
        name: company.name,
        description: `${company.industry} · ${company.city}, ${company.country} · ${company.employees} employees`,
        mimeType: 'application/json',
      })),
    }),
  });

  server.registerResource(
    'company',
    template,
    { title: 'Company profile', description: 'Full company profile as JSON', mimeType: 'application/json' },
    (uri, { companyId }) => {
      try {
        const company = services.companies.get(String(companyId));
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(company, null, 2) }] };
      } catch (error) {
        if (error instanceof AppError) throw new McpError(ErrorCode.InvalidParams, error.message);
        throw error;
      }
    },
  );
}

function registerProspectingPrompt(server: McpServer, principal: Principal): void {
  const canEnrich = hasScope(principal, SCOPES.CONTACTS_ENRICH);
  const canExport = hasScope(principal, SCOPES.CONTACTS_EXPORT);

  server.registerPrompt(
    'build_prospect_list',
    {
      title: 'Build a prospect list',
      description: 'Find decision makers matching a role at companies in a segment, then enrich and export them.',
      argsSchema: {
        role: z.string().describe('Job title to target, e.g. "Head of Engineering"'),
        segment: z.string().describe('Kind of company, e.g. "AI companies" or "fintech"'),
        country: z.string().optional().describe('Country to focus on, e.g. "Australia"'),
      },
    },
    ({ role, segment, country }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Build a prospect list of people with the role "${role}" at ${segment}${country ? ` in ${country}` : ''}.`,
              '1. Use search_companies to find up to 10 matching companies.',
              '2. For each company, use search_contacts with the role as jobTitle.',
              canEnrich
                ? '3. Use enrich_contact on the best match at each company to get their email and LinkedIn.'
                : '3. (This API key cannot enrich contacts; skip enrichment.)',
              canExport
                ? '4. Use export_contacts with the selected contact IDs and share the download link.'
                : '4. (This API key cannot export; present the list as a table instead.)',
              'Finish with a table: name, title, company, email (if enriched).',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
