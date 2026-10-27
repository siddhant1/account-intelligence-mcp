import type { Db } from '../db/database.js';
import type { Company } from '../domain/types.js';

interface CompanyRow {
  id: string;
  name: string;
  domain: string;
  website: string;
  industry: string;
  employees: number;
  country: string;
  city: string;
  founded_year: number | null;
  description: string;
  tags: string;
}

/** A search term matches when any of its alternatives match (e.g. "ai" OR "machine learning"). */
export type SearchTerm = readonly string[];

export interface CompanySearchCriteria {
  /** Every term must match (AND), unless `matchAny` is set (OR). Empty = no text filter. */
  terms: readonly SearchTerm[];
  matchAny?: boolean;
  country?: string;
  /** Canonical industry names; a company matches if it is in any of them. */
  industries?: readonly string[];
  minEmployees?: number;
  maxEmployees?: number;
  limit: number;
}

export interface CompanySearchPage {
  companies: Company[];
  total: number;
}

const toCompany = (row: CompanyRow): Company => ({
  id: row.id,
  name: row.name,
  domain: row.domain,
  website: row.website,
  industry: row.industry,
  employees: row.employees,
  country: row.country,
  city: row.city,
  foundedYear: row.founded_year,
  description: row.description,
  tags: row.tags ? row.tags.split(',') : [],
});

/** Quote a token for FTS5 so user input can never inject query syntax. Long tokens get prefix matching. */
function ftsToken(token: string): string {
  const quoted = `"${token.replaceAll('"', '""')}"`;
  return !token.includes(' ') && token.length >= 4 ? `${quoted}*` : quoted;
}

export function toFtsExpression(terms: readonly SearchTerm[], matchAny = false): string {
  return terms.map((alternatives) => `(${alternatives.map(ftsToken).join(' OR ')})`).join(matchAny ? ' OR ' : ' AND ');
}

export class CompanyRepository {
  private readonly byId;
  private readonly contactCount;
  private readonly countries;
  private readonly industries;
  private readonly insert;

  constructor(private readonly db: Db) {
    this.byId = db.prepare<[string], CompanyRow>('SELECT * FROM companies WHERE id = ?');
    this.contactCount = db.prepare<[string], { n: number }>('SELECT count(*) AS n FROM contacts WHERE company_id = ?');
    this.countries = db.prepare<[], { country: string }>('SELECT DISTINCT country FROM companies ORDER BY country');
    this.industries = db.prepare<[], { industry: string }>('SELECT DISTINCT industry FROM companies ORDER BY industry');
    this.insert = db.prepare(
      `INSERT INTO companies (id, name, domain, website, industry, employees, country, city, founded_year, description, tags)
       VALUES (@id, @name, @domain, @website, @industry, @employees, @country, @city, @foundedYear, @description, @tags)`,
    );
  }

  findById(id: string): Company | undefined {
    const row = this.byId.get(id);
    return row ? toCompany(row) : undefined;
  }

  countContacts(companyId: string): number {
    return this.contactCount.get(companyId)?.n ?? 0;
  }

  distinctCountries(): string[] {
    return this.countries.all().map((row) => row.country);
  }

  distinctIndustries(): string[] {
    return this.industries.all().map((row) => row.industry);
  }

  search(criteria: CompanySearchCriteria): CompanySearchPage {
    const hasText = criteria.terms.length > 0;
    const where: string[] = [];
    const params: Record<string, string | number> = { limit: criteria.limit };

    if (hasText) {
      where.push('companies_fts MATCH @match');
      params.match = toFtsExpression(criteria.terms, criteria.matchAny);
    }
    if (criteria.country) {
      where.push('c.country = @country COLLATE NOCASE');
      params.country = criteria.country;
    }
    if (criteria.industries?.length) {
      const names = criteria.industries.map((industry, index) => {
        params[`industry${index}`] = industry;
        return `@industry${index}`;
      });
      where.push(`c.industry IN (${names.join(', ')})`);
    }
    if (criteria.minEmployees !== undefined) {
      where.push('c.employees >= @minEmployees');
      params.minEmployees = criteria.minEmployees;
    }
    if (criteria.maxEmployees !== undefined) {
      where.push('c.employees <= @maxEmployees');
      params.maxEmployees = criteria.maxEmployees;
    }

    // Rank in a CTE: SQLite cannot evaluate bm25() in the same SELECT as a window function.
    // bm25 column weights: name, industry, description, tags, city, country.
    const sql = `
      WITH matches AS (
        SELECT c.*, ${hasText ? 'bm25(companies_fts, 8.0, 4.0, 1.0, 5.0, 2.0, 2.0)' : '0'} AS rank
        FROM ${hasText ? 'companies_fts JOIN companies c ON c.rowid = companies_fts.rowid' : 'companies c'}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      )
      SELECT *, count(*) OVER () AS total
      FROM matches
      ORDER BY rank, employees DESC, id
      LIMIT @limit`;

    const rows = this.db.prepare<[typeof params], CompanyRow & { total: number }>(sql).all(params);
    return { companies: rows.map(toCompany), total: rows[0]?.total ?? 0 };
  }

  insertMany(companies: readonly Company[]): void {
    this.db.transaction(() => {
      for (const company of companies) {
        this.insert.run({ ...company, tags: company.tags.join(',') });
      }
    })();
  }
}
