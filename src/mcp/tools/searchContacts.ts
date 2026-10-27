import { z } from 'zod';
import { SCOPES } from '../../auth/scopes.js';
import { fullName } from '../../domain/types.js';
import { companyIdSchema, contactSummarySchema, departmentSchema, senioritySchema } from '../schemas.js';
import { defineTool } from '../toolDefinition.js';

export const searchContactsTool = defineTool({
  name: 'search_contacts',
  title: 'Search contacts',
  description:
    'Find people, optionally within one company, filtered by job title, seniority or department. Results are ' +
    'ordered most senior first. Contact details (email, LinkedIn) are not included; call enrich_contact for those.',
  scope: SCOPES.CONTACTS_READ,
  inputSchema: {
    companyId: companyIdSchema.optional(),
    jobTitle: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .optional()
      .describe(
        'Job title filter; every word must appear in the title (case-insensitive), e.g. "Engineer", "Head of Sales"',
      ),
    seniority: senioritySchema.optional().describe('Seniority band'),
    department: departmentSchema.optional().describe('Department'),
    limit: z.number().int().min(1).max(100).default(25).describe('Maximum results to return (1-100, default 25)'),
  },
  outputSchema: {
    contacts: z.array(contactSummarySchema),
    total: z.number().int().describe('Number of matching contacts before the limit was applied'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  execute(input, { services }) {
    const page = services.contacts.search(input);
    return {
      contacts: page.contacts.map((contact) => ({
        id: contact.id,
        name: fullName(contact),
        title: contact.title,
        seniority: contact.seniority,
        department: contact.department,
        location: contact.location,
        companyId: contact.companyId,
        companyName: contact.companyName,
        enriched: contact.enrichment !== null,
      })),
      total: page.total,
    };
  },
});
