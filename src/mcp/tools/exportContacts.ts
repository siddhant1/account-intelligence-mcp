import { z } from 'zod';
import { SCOPES } from '../../auth/scopes.js';
import { EXPORT_FORMATS } from '../../domain/types.js';
import { contactIdSchema } from '../schemas.js';
import { defineTool } from '../toolDefinition.js';

export const MAX_EXPORT_CONTACTS = 1000;

export const exportContactsTool = defineTool({
  name: 'export_contacts',
  title: 'Export contacts',
  description:
    'Export contacts to a CSV (default) or JSON file and return a signed, time-limited download URL that works ' +
    'without an API key. The file includes company and enrichment fields; contacts that were never enriched have ' +
    'empty email/LinkedIn columns, so call enrich_contact first if those are needed. Duplicate IDs are ignored.',
  scope: SCOPES.CONTACTS_EXPORT,
  inputSchema: {
    contactIds: z
      .array(contactIdSchema)
      .min(1, 'provide at least one contact ID')
      .max(MAX_EXPORT_CONTACTS, `at most ${MAX_EXPORT_CONTACTS} contacts per export`)
      .describe('Contact IDs to export, e.g. ["cnt_1", "cnt_2"]'),
    format: z.enum(EXPORT_FORMATS).default('csv').describe('File format (default "csv")'),
  },
  outputSchema: {
    downloadUrl: z.url().describe('Signed download link; share it with the user'),
    exportId: z.string(),
    format: z.enum(EXPORT_FORMATS),
    contactCount: z.number().int(),
    expiresAt: z.iso.datetime().describe('When the download link stops working'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  execute(input, { services, principal }) {
    return services.exports.create(input, principal);
  },
});
