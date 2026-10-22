import { z } from 'zod';
import { SCOPES } from '../../auth/scopes.js';
import { fullName } from '../../domain/types.js';
import { contactIdSchema } from '../schemas.js';
import { defineTool } from '../toolDefinition.js';

export const enrichContactTool = defineTool({
  name: 'enrich_contact',
  title: 'Enrich contact',
  description:
    'Look up verified contact details (work email, LinkedIn profile, phone) for one contact through the enrichment ' +
    'provider. Results are saved, so repeat calls for the same contact return the stored data. LinkedIn and phone ' +
    'can be null when the provider has no match. Only enrich contacts the user actually needs.',
  scope: SCOPES.CONTACTS_ENRICH,
  inputSchema: { contactId: contactIdSchema },
  outputSchema: {
    contactId: z.string(),
    name: z.string(),
    email: z.email(),
    linkedin: z.url().nullable(),
    phone: z.string().nullable(),
    enrichedAt: z.iso.datetime(),
    cached: z.boolean().describe('True if returned from a previous enrichment instead of a new provider lookup'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async execute({ contactId }, { services, signal }) {
    const { contact, enrichment, cached } = await services.contacts.enrich(contactId, signal);
    return {
      contactId: contact.id,
      name: fullName(contact),
      email: enrichment.email,
      linkedin: enrichment.linkedin,
      phone: enrichment.phone,
      enrichedAt: enrichment.enrichedAt,
      cached,
    };
  },
});
