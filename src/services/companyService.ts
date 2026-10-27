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

/** Shorthand clients use for industries in the dataset. */
const INDUSTRY_ALIASES: Record<string, string> = {
  ai: 'Artificial Intelligence',
  ml: 'Artificial Intelligence',
  'machine learning': 'Artificial Intelligence',
  saas: 'Software',
  payments: 'Fintech',
  'financial services': 'Fintech',
  health: 'Healthcare',
  healthtech: 'Healthcare',
  medtech: 'Healthcare',
  edtech: 'Education',
  security: 'Cybersecurity',
  infosec: 'Cybersecurity',
  cyber: 'Cybersecurity',
  retail: 'E-commerce',
  insurtech: 'Insurance',
  legaltech: 'Legal Tech',
  hrtech: 'HR Tech',
  agtech: 'Agritech',
  agriculture: 'Agritech',
  cleantech: 'Energy',
  renewables: 'Energy',
  'supply chain': 'Logistics',
  gaming: 'Media',
  robotics: 'Manufacturing',
};

/** Compact form for comparing user input with dataset values: "U.S." -> "us", "E-commerce" -> "ecommerce". */
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const lookup = (aliases: Record<string, string>, key: string) =>
  Object.entries(aliases).find(([alias]) => normalize(alias) === key)?.[1];

const MIN_PARTIAL_MATCH = 3;

export class CompanyService {
  constructor(private readonly companies: CompanyRepository) {}

  search(input: CompanySearchInput): CompanySearchPage {
    if (
      input.minEmployees !== undefined &&
      input.maxEmployees !== undefined &&
      input.minEmployees > input.maxEmployees
    ) {
      throw new ValidationError('minEmployees must be less than or equal to maxEmployees');
    }

    const terms = parseSearchQuery(input.query);
    const criteria = {
      terms,
      country: input.country ? this.resolveCountry(input.country) : undefined,
      industries: input.industry ? this.resolveIndustries(input.industry) : undefined,
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

  /** Maps a country name or code ("AU", "U.S.", "britain") to the canonical name stored in the dataset. */
  resolveCountry(input: string): string {
    const key = normalize(input);
    const known = this.companies.distinctCountries();
    const target = normalize(lookup(COUNTRY_ALIASES, key) ?? key);
    const match = known.find((country) => normalize(country) === target);
    if (!match) {
      throw new ValidationError(`Unknown country "${input}"`, `Countries in the dataset: ${known.join(', ')}.`);
    }
    return match;
  }

  /**
   * Maps an industry filter to canonical industries: an alias ("AI"), an exact
   * name ("ecommerce" for "E-commerce"), or every industry containing it
   * ("tech" matches Fintech, Legal Tech, HR Tech...).
   */
  resolveIndustries(input: string): string[] {
    const key = normalize(input);
    const known = this.companies.distinctIndustries();
    const target = normalize(lookup(INDUSTRY_ALIASES, key) ?? key);
    const exact = known.filter((industry) => normalize(industry) === target);
    if (exact.length) return exact;

    const partial =
      key.length >= MIN_PARTIAL_MATCH ? known.filter((industry) => normalize(industry).includes(key)) : [];
    if (!partial.length) {
      throw new ValidationError(`Unknown industry "${input}"`, `Industries in the dataset: ${known.join(', ')}.`);
    }
    return partial;
  }

  /** Countries and industries present in the dataset, for prompts and instructions. */
  facets(): { countries: string[]; industries: string[] } {
    return { countries: this.companies.distinctCountries(), industries: this.companies.distinctIndustries() };
  }
}
