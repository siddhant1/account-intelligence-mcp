import type { Db } from '../db/database.js';
import type { Contact, ContactEnrichment, Department, Seniority } from '../domain/types.js';
import type { TitleTerm } from '../services/search/queryParser.js';

interface ContactRow {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  title: string;
  department: Department;
  seniority: Seniority;
  location: string;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  enriched_at: string | null;
  company_name: string;
}

/** A contact joined with the company it belongs to. */
export interface ContactWithCompany extends Contact {
  companyName: string;
}

export interface ContactSearchCriteria {
  companyId?: string;
  /** Every term must match the start of a word in the job title (case-insensitive). */
  titleTerms: readonly TitleTerm[];
  seniority?: Seniority;
  department?: Department;
  limit: number;
}

const toContact = (row: ContactRow): ContactWithCompany => ({
  id: row.id,
  companyId: row.company_id,
  companyName: row.company_name,
  firstName: row.first_name,
  lastName: row.last_name,
  title: row.title,
  department: row.department,
  seniority: row.seniority,
  location: row.location,
  enrichment:
    row.enriched_at && row.email
      ? { email: row.email, linkedin: row.linkedin_url, phone: row.phone, enrichedAt: row.enriched_at }
      : null,
});

const SELECT_WITH_COMPANY = `
  SELECT ct.*, c.name AS company_name
  FROM contacts ct JOIN companies c ON c.id = ct.company_id`;

const WORD_START = '(?<![\\p{L}\\p{N}])';
const WORD_END = '(?![\\p{L}\\p{N}])';
/** Regex source for a word or phrase; phrases tolerate any whitespace between words. */
const toRegex = (alternative: string) => alternative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(' ', '\\s+');

/**
 * Pattern for filtering: each alternative must start a word, so "eng" matches
 * "Engineering" but "cto" does not match inside "Director". Abbreviations (3
 * letters or fewer) must match a whole word.
 */
export function titleFilterPattern(term: TitleTerm): string {
  const alternatives = term.map((alternative) =>
    alternative.length <= 3 ? `${toRegex(alternative)}${WORD_END}` : toRegex(alternative),
  );
  return `${WORD_START}(?:${alternatives.join('|')})`;
}

/** Pattern for ranking: the whole word (singular or plural), e.g. "Engineer" but not "Engineering". */
export function titleExactPattern(term: TitleTerm): string {
  return `${WORD_START}(?:${term.map(toRegex).join('|')})s?${WORD_END}`;
}

/** Sort contacts by seniority (most senior first), then by id for stable pagination. */
const SENIORITY_ORDER = `CASE ct.seniority
  WHEN 'executive' THEN 0 WHEN 'vp' THEN 1 WHEN 'director' THEN 2
  WHEN 'manager' THEN 3 WHEN 'senior' THEN 4 ELSE 5 END`;

export class ContactRepository {
  private readonly byId;
  private readonly enrich;
  private readonly insert;

  constructor(private readonly db: Db) {
    this.byId = db.prepare<[string], ContactRow>(`${SELECT_WITH_COMPANY} WHERE ct.id = ?`);
    this.enrich = db.prepare(
      `UPDATE contacts SET email = @email, linkedin_url = @linkedin, phone = @phone, enriched_at = @enrichedAt
       WHERE id = @id`,
    );
    this.insert = db.prepare(
      `INSERT INTO contacts (id, company_id, first_name, last_name, title, department, seniority, location)
       VALUES (@id, @companyId, @firstName, @lastName, @title, @department, @seniority, @location)`,
    );
  }

  findById(id: string): ContactWithCompany | undefined {
    const row = this.byId.get(id);
    return row ? toContact(row) : undefined;
  }

  /** Returns the contacts that exist, in the order of the requested ids. */
  findByIds(ids: readonly string[]): ContactWithCompany[] {
    if (ids.length === 0) return [];
    const rows = this.db
      .prepare<string[], ContactRow>(`${SELECT_WITH_COMPANY} WHERE ct.id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids);
    const byId = new Map(rows.map((row) => [row.id, toContact(row)]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  search(criteria: ContactSearchCriteria): { contacts: ContactWithCompany[]; total: number } {
    const where: string[] = [];
    const params: Record<string, string | number> = { limit: criteria.limit };

    if (criteria.companyId) {
      where.push('ct.company_id = @companyId');
      params.companyId = criteria.companyId;
    }
    const exact: string[] = [];
    criteria.titleTerms.forEach((term, index) => {
      where.push(`ct.title REGEXP @title${index}`);
      params[`title${index}`] = titleFilterPattern(term);
      exact.push(`ct.title REGEXP @exact${index}`);
      params[`exact${index}`] = titleExactPattern(term);
    });
    // Titles where every term is a whole word rank first: "Engineer" before "VP of Engineering".
    const titleRank = exact.length ? `CASE WHEN ${exact.join(' AND ')} THEN 0 ELSE 1 END, ` : '';
    if (criteria.seniority) {
      where.push('ct.seniority = @seniority');
      params.seniority = criteria.seniority;
    }
    if (criteria.department) {
      where.push('ct.department = @department');
      params.department = criteria.department;
    }

    const sql = `
      SELECT ct.*, c.name AS company_name, count(*) OVER () AS total
      FROM contacts ct JOIN companies c ON c.id = ct.company_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${titleRank}${SENIORITY_ORDER}, ct.rowid
      LIMIT @limit`;

    const rows = this.db.prepare<[typeof params], ContactRow & { total: number }>(sql).all(params);
    return { contacts: rows.map(toContact), total: rows[0]?.total ?? 0 };
  }

  saveEnrichment(id: string, enrichment: ContactEnrichment): void {
    this.enrich.run({ id, ...enrichment });
  }

  insertMany(contacts: readonly Omit<Contact, 'enrichment'>[]): void {
    this.db.transaction(() => {
      for (const contact of contacts) this.insert.run(contact);
    })();
  }
}
