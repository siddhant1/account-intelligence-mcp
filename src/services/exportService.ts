import { randomBytes } from 'node:crypto';
import type { Principal } from '../auth/scopes.js';
import type { Clock } from '../domain/clock.js';
import { ExpiredError, ForbiddenError, NotFoundError } from '../domain/errors.js';
import { fullName, type ExportFormat, type ExportRecord } from '../domain/types.js';
import type { ContactRepository, ContactWithCompany } from '../repositories/contactRepository.js';
import type { ExportRepository } from '../repositories/exportRepository.js';
import type { UrlSigner } from './urlSigner.js';

export interface ExportResult {
  exportId: string;
  downloadUrl: string;
  format: ExportFormat;
  contactCount: number;
  expiresAt: string;
}

const COLUMNS = [
  ['contact_id', (c) => c.id],
  ['full_name', (c) => fullName(c)],
  ['first_name', (c) => c.firstName],
  ['last_name', (c) => c.lastName],
  ['title', (c) => c.title],
  ['seniority', (c) => c.seniority],
  ['department', (c) => c.department],
  ['location', (c) => c.location],
  ['company_id', (c) => c.companyId],
  ['company_name', (c) => c.companyName],
  ['email', (c) => c.enrichment?.email ?? ''],
  ['linkedin', (c) => c.enrichment?.linkedin ?? ''],
  ['phone', (c) => c.enrichment?.phone ?? ''],
  ['enriched_at', (c) => c.enrichment?.enrichedAt ?? ''],
] as const satisfies readonly (readonly [string, (contact: ContactWithCompany) => string])[];

/**
 * Quotes a CSV cell per RFC 4180 and neutralises spreadsheet formula
 * injection (cells starting with = + - @ are prefixed with an apostrophe).
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(contacts: readonly ContactWithCompany[]): string {
  const header = COLUMNS.map(([name]) => name).join(',');
  const rows = contacts.map((contact) => COLUMNS.map(([, get]) => csvCell(get(contact))).join(','));
  return `${[header, ...rows].join('\r\n')}\r\n`;
}

function toJson(contacts: readonly ContactWithCompany[]): string {
  const records = contacts.map((contact) => Object.fromEntries(COLUMNS.map(([name, get]) => [name, get(contact) || null])));
  return JSON.stringify({ contacts: records }, null, 2);
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
};

export class ExportService {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly exports: ExportRepository,
    private readonly signer: UrlSigner,
    private readonly clock: Clock,
    private readonly ttlSeconds: number,
  ) {}

  create(input: { contactIds: readonly string[]; format: ExportFormat }, principal: Principal): ExportResult {
    const ids = [...new Set(input.contactIds)];
    const found = this.contacts.findByIds(ids);
    if (found.length !== ids.length) {
      const foundIds = new Set(found.map((contact) => contact.id));
      const missingIds = ids.filter((id) => !foundIds.has(id));
      throw new NotFoundError(
        `${missingIds.length} of ${ids.length} contact IDs were not found: ${missingIds.slice(0, 10).join(', ')}`,
        'Remove the unknown IDs, or use search_contacts to find valid ones. Nothing was exported.',
        { missingIds },
      );
    }

    const now = this.clock();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    const id = `exp_${randomBytes(12).toString('base64url')}`;
    const record: ExportRecord = {
      id,
      apiKeyId: principal.apiKeyId,
      format: input.format,
      contactCount: found.length,
      fileName: `contacts-${now.toISOString().slice(0, 10)}-${id.slice(4, 12)}.${input.format}`,
      contentType: CONTENT_TYPES[input.format],
      content: Buffer.from(input.format === 'csv' ? toCsv(found) : toJson(found), 'utf8'),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    this.exports.deleteExpired(now.toISOString());
    this.exports.insert(record);

    return {
      exportId: id,
      downloadUrl: this.signer.sign(`/exports/${id}`, expiresAt),
      format: record.format,
      contactCount: record.contactCount,
      expiresAt: record.expiresAt,
    };
  }

  /** Validates a signed download link and returns the export file it points to. */
  resolveDownload(exportId: string, expires: string | undefined, signature: string | undefined): ExportRecord {
    const expiresAt = Number(expires);
    if (!signature || !Number.isSafeInteger(expiresAt) || !this.signer.verify(`/exports/${exportId}`, expiresAt, signature)) {
      throw new ForbiddenError('Invalid or missing download signature', 'Request a new link with export_contacts.');
    }
    if (expiresAt * 1000 < this.clock().getTime()) {
      throw new ExpiredError('This download link has expired', 'Request a new link with export_contacts.');
    }
    const record = this.exports.findById(exportId);
    if (!record) throw new NotFoundError('Export not found');
    return record;
  }
}
