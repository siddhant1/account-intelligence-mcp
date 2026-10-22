import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ContactEnrichment } from '../../domain/types.js';

export interface EnrichmentRequest {
  contactId: string;
  firstName: string;
  lastName: string;
  companyDomain: string;
  country: string;
}

export type EnrichmentResult = Omit<ContactEnrichment, 'enrichedAt'>;

/**
 * Port for third-party enrichment vendors (Apollo, Clearbit, People Data Labs...).
 * Swapping vendors means adding an implementation, not touching the services.
 */
export interface EnrichmentProvider {
  readonly name: string;
  enrich(request: EnrichmentRequest, signal?: AbortSignal): Promise<EnrichmentResult>;
}

const DIALING_CODES: Record<string, string> = {
  Australia: '+61',
  'New Zealand': '+64',
  'United States': '+1',
  Canada: '+1',
  'United Kingdom': '+44',
  Singapore: '+65',
  Germany: '+49',
  India: '+91',
  Ireland: '+353',
};

const EMAIL_PATTERNS = [
  (first: string, last: string) => `${first}.${last}`,
  (first: string, last: string) => `${first}${last.charAt(0)}`,
  (first: string, last: string) => `${first.charAt(0)}${last}`,
  (first: string) => first,
] as const;

const slug = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Deterministic stand-in for a real enrichment vendor. Each company uses one
 * email pattern, and some contacts have no LinkedIn profile or phone number,
 * so clients have to handle partial results just as they would in production.
 */
export class SimulatedEnrichmentProvider implements EnrichmentProvider {
  readonly name = 'simulated';

  constructor(private readonly latencyMs = 0) {}

  async enrich(request: EnrichmentRequest, signal?: AbortSignal): Promise<EnrichmentResult> {
    if (this.latencyMs > 0) await sleep(this.latencyMs, undefined, { signal });

    const first = slug(request.firstName);
    const last = slug(request.lastName);
    const contactHash = digest(request.contactId);
    const pattern = EMAIL_PATTERNS[digest(request.companyDomain)[0]! % EMAIL_PATTERNS.length]!;

    const hasLinkedin = contactHash[0]! % 10 !== 0; // ~90% match rate
    const hasPhone = contactHash[1]! % 3 !== 0; // ~66% match rate
    const phoneDigits = Array.from(contactHash.subarray(2, 11), (byte) => byte % 10).join('');

    return {
      email: `${pattern(first, last)}@${request.companyDomain}`,
      linkedin: hasLinkedin
        ? `https://www.linkedin.com/in/${first}-${last}-${contactHash.subarray(12, 15).toString('hex')}`
        : null,
      phone: hasPhone ? `${DIALING_CODES[request.country] ?? '+1'} ${phoneDigits}` : null,
    };
  }
}
