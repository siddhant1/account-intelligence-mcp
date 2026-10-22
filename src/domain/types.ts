/** Core domain model. Persistence and transport layers map to and from these shapes. */

export const SENIORITIES = ['executive', 'vp', 'director', 'manager', 'senior', 'individual_contributor'] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const DEPARTMENTS = ['executive', 'engineering', 'product', 'sales', 'marketing', 'operations'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export interface Company {
  id: string;
  name: string;
  domain: string;
  website: string;
  industry: string;
  employees: number;
  country: string;
  city: string;
  foundedYear: number | null;
  description: string;
  tags: string[];
}

export interface Contact {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  title: string;
  department: Department;
  seniority: Seniority;
  location: string;
  enrichment: ContactEnrichment | null;
}

export interface ContactEnrichment {
  email: string;
  linkedin: string | null;
  phone: string | null;
  enrichedAt: string;
}

export interface ExportRecord {
  id: string;
  apiKeyId: string;
  format: ExportFormat;
  contactCount: number;
  fileName: string;
  contentType: string;
  content: Buffer;
  createdAt: string;
  expiresAt: string;
}

export const EXPORT_FORMATS = ['csv', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const fullName = (contact: Pick<Contact, 'firstName' | 'lastName'>) => `${contact.firstName} ${contact.lastName}`;
