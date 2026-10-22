import { z } from 'zod';
import { DEPARTMENTS, SENIORITIES } from '../domain/types.js';

/** Shared Zod schemas. They drive runtime validation, the JSON Schema clients see, and the TypeScript types. */

export const companyIdSchema = z
  .string()
  .trim()
  .regex(/^cmp_\d{1,9}$/, 'must be a company ID such as "cmp_1"')
  .describe('Company ID returned by search_companies, e.g. "cmp_1"');

export const contactIdSchema = z
  .string()
  .trim()
  .regex(/^cnt_\d{1,9}$/, 'must be a contact ID such as "cnt_1"')
  .describe('Contact ID returned by search_contacts, e.g. "cnt_1"');

export const senioritySchema = z.enum(SENIORITIES);
export const departmentSchema = z.enum(DEPARTMENTS);

export const companySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string(),
  employees: z.number().int(),
  country: z.string(),
  city: z.string(),
});

export const contactSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  seniority: senioritySchema,
  department: departmentSchema,
  location: z.string(),
  companyId: z.string(),
  companyName: z.string(),
  enriched: z.boolean().describe('Whether email/LinkedIn are already available (see enrich_contact)'),
});
