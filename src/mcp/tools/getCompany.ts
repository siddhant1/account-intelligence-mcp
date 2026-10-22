import { z } from 'zod';
import { SCOPES } from '../../auth/scopes.js';
import { companyIdSchema } from '../schemas.js';
import { defineTool } from '../toolDefinition.js';

export const getCompanyTool = defineTool({
  name: 'get_company',
  title: 'Get company details',
  description:
    'Get the full profile of one company: website, industry, headcount, location, founding year, description, tags ' +
    'and how many contacts are on file. Use an ID from search_companies.',
  scope: SCOPES.COMPANIES_READ,
  inputSchema: { companyId: companyIdSchema },
  outputSchema: {
    id: z.string(),
    name: z.string(),
    website: z.url(),
    industry: z.string(),
    employees: z.number().int(),
    description: z.string(),
    country: z.string(),
    city: z.string(),
    foundedYear: z.number().int().nullable(),
    tags: z.array(z.string()),
    contactCount: z.number().int().describe('Contacts available via search_contacts'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  execute({ companyId }, { services }) {
    const { id, name, website, industry, employees, description, country, city, foundedYear, tags, contactCount } =
      services.companies.get(companyId);
    return { id, name, website, industry, employees, description, country, city, foundedYear, tags, contactCount };
  },
});
