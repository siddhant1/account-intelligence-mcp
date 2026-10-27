import type { Clock } from '../domain/clock.js';
import { NotFoundError } from '../domain/errors.js';
import type { ContactEnrichment, Department, Seniority } from '../domain/types.js';
import type { CompanyRepository } from '../repositories/companyRepository.js';
import type { ContactRepository, ContactWithCompany } from '../repositories/contactRepository.js';
import type { EnrichmentProvider } from './enrichment/enrichmentProvider.js';
import { parseJobTitle } from './search/queryParser.js';

export interface ContactSearchInput {
  companyId?: string;
  jobTitle?: string;
  seniority?: Seniority;
  department?: Department;
  limit: number;
}

export interface EnrichedContact {
  contact: ContactWithCompany;
  enrichment: ContactEnrichment;
  /** True when the data came from a previous enrichment rather than a new provider call. */
  cached: boolean;
}

export class ContactService {
  /** Lookups in progress, so concurrent requests for one contact share a single provider call. */
  private readonly inFlight = new Map<string, Promise<EnrichedContact>>();

  constructor(
    private readonly contacts: ContactRepository,
    private readonly companies: CompanyRepository,
    private readonly provider: EnrichmentProvider,
    private readonly clock: Clock,
  ) {}

  search(input: ContactSearchInput): { contacts: ContactWithCompany[]; total: number } {
    if (input.companyId && !this.companies.findById(input.companyId)) {
      throw new NotFoundError(
        `Company ${input.companyId} was not found`,
        'Use search_companies to look up valid company IDs.',
      );
    }
    return this.contacts.search({
      companyId: input.companyId,
      titleTerms: parseJobTitle(input.jobTitle),
      seniority: input.seniority,
      department: input.department,
      limit: input.limit,
    });
  }

  /**
   * Returns verified contact details, calling the enrichment provider only the
   * first time. Results are persisted, so repeat calls are free and idempotent,
   * and concurrent calls for the same contact wait for the same lookup (one
   * provider charge, not one per request).
   */
  async enrich(contactId: string): Promise<EnrichedContact> {
    const contact = this.contacts.findById(contactId);
    if (!contact) {
      throw new NotFoundError(
        `Contact ${contactId} was not found`,
        'Use search_contacts to look up valid contact IDs.',
      );
    }
    if (contact.enrichment) return { contact, enrichment: contact.enrichment, cached: true };

    const pending = this.inFlight.get(contactId);
    if (pending) return { ...(await pending), cached: true };

    const lookup = this.lookup(contact).finally(() => this.inFlight.delete(contactId));
    this.inFlight.set(contactId, lookup);
    return lookup;
  }

  /**
   * Not tied to the caller's abort signal: other requests may be waiting on
   * this lookup, and a completed lookup is stored, so the credit is not wasted.
   */
  private async lookup(contact: ContactWithCompany): Promise<EnrichedContact> {
    const company = this.companies.findById(contact.companyId);
    if (!company) throw new Error(`Contact ${contact.id} references missing company ${contact.companyId}`);

    const result = await this.provider.enrich({
      contactId: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      companyDomain: company.domain,
      country: company.country,
    });
    const enrichment: ContactEnrichment = { ...result, enrichedAt: this.clock().toISOString() };
    this.contacts.saveEnrichment(contact.id, enrichment);
    return { contact: { ...contact, enrichment }, enrichment, cached: false };
  }
}
