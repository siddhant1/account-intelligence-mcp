import { z } from 'zod';
import { SCOPES } from '../../auth/scopes.js';
import { companySummarySchema } from '../schemas.js';
import { defineTool } from '../toolDefinition.js';

export const searchCompaniesTool = defineTool({
  name: 'search_companies',
  title: 'Search companies',
  description:
    'Search the company database by free text and filters. Text matches company name, industry, description and ' +
    'tags with relevance ranking; filler words such as "companies" are ignored and shorthand like "AI" or "fintech" ' +
    'is expanded. Returns compact summaries; call get_company for full details or search_contacts to find people.',
  scope: SCOPES.COMPANIES_READ,
  inputSchema: {
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe('Free-text query, e.g. "AI companies", "payments", "computer vision". Omit to list by size.'),
    country: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .optional()
      .describe('Country name or code, e.g. "Australia", "AU", "U.S.". Unknown values return the valid list.'),
    industry: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .optional()
      .describe(
        'Industry name or shorthand, e.g. "Fintech", "Healthcare", "AI" (= Artificial Intelligence), "tech" (all *tech industries). Unknown values return the valid list.',
      ),
    minEmployees: z.number().int().min(1).optional().describe('Minimum headcount (inclusive)'),
    maxEmployees: z.number().int().min(1).optional().describe('Maximum headcount (inclusive)'),
    limit: z.number().int().min(1).max(50).default(10).describe('Maximum results to return (1-50, default 10)'),
  },
  outputSchema: {
    results: z.array(companySummarySchema),
    total: z.number().int().describe('Number of matching companies before the limit was applied'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  execute(input, { services }) {
    const page = services.companies.search(input);
    return {
      results: page.companies.map(({ id, name, industry, employees, country, city }) => ({
        id,
        name,
        industry,
        employees,
        country,
        city,
      })),
      total: page.total,
    };
  },
});
