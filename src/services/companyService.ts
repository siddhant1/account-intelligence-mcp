import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { Company } from '../domain/types.js';
import type { CompanyRepository, CompanySearchPage } from '../repositories/companyRepository.js';
import { parseSearchQuery } from './search/queryParser.js';

export interface CompanySearchInput {
  query?: string;
  country?: string;
  industry?: string;
  minEmployees?: number;
  maxEmployees?: number;
  limit: number;
}

export interface CompanyDetails extends Company {
  contactCount: number;
}

/** Common names and ISO codes that clients use for the countries in the dataset. */
const COUNTRY_ALIASES: Record<string, string> = {
  au: 'Australia',
  aus: 'Australia',
  oz: 'Australia',
  nz: 'New Zealand',
  aotearoa: 'New Zealand',
  us: 'United States',
  usa: 'United States',
  'united states of america': 'United States',
  america: 'United States',
  uk: 'United Kingdom',
  gb: 'United Kingdom',
  'great britain': 'United Kingdom',
  britain: 'United Kingdom',
  england: 'United Kingdom',
  sg: 'Singapore',
  ca: 'Canada',
  de: 'Germany',
  deutschland: 'Germany',
  in: 'India',
  ie: 'Ireland',
};

export class CompanyService {
  constructor(private readonly companies: CompanyRepository) {}

  search(input: CompanySearchInput): CompanySearchPage {
    if (input.minEmployees !== undefined && input.maxEmployees !== undefined && input.minEmployees > input.maxEmployees) {
      throw new ValidationError('minEmployees must be less than or equal to maxEmployees');
    }

    const terms = parseSearchQuery(input.query);
    const criteria = {
      terms,
      country: input.country ? this.resolveCountry(input.country) : undefined,
      industry: input.industry?.trim() || undefined,
      minEmployees: input.minEmployees,
      maxEmployees: input.maxEmployees,
      limit: input.limit,
    };

    const strict = this.companies.search(criteria);
    // Multi-word queries first require every term; if nothing matches, relax to any term.
    if (strict.total === 0 && terms.length > 1) {
      return this.companies.search({ ...criteria, matchAny: true });
    }
    return strict;
  }

  get(companyId: string): CompanyDetails {
    const company = this.companies.findById(companyId);
    if (!company) {
      throw new NotFoundError(
        `Company ${companyId} was not found`,
        'Use search_companies to look up valid company IDs.',
      );
    }
    return { ...company, contactCount: this.companies.countContacts(companyId) };
  }

  /** Maps user-supplied country names/codes to the canonical name stored in the dataset. */
  resolveCountry(input: string): string {
    const key = input.trim().toLowerCase();
    const known = this.companies.distinctCountries();
    const match = known.find((country) => country.toLowerCase() === (COUNTRY_ALIASES[key]?.toLowerCase() ?? key));
    if (!match) {
      throw new ValidationError(`Unknown country "${input}"`, `Countries in the dataset: ${known.join(', ')}.`);
    }
    return match;
  }
}
