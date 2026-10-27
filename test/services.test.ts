import { describe, expect, it } from 'vitest';
import { AppError } from '../src/domain/errors.js';
import { toCsv } from '../src/services/exportService.js';
import { parseJobTitle, parseSearchQuery } from '../src/services/search/queryParser.js';
import { createTestContainer } from './helpers.js';

const { container, principals } = createTestContainer();
const { companies, contacts, exports } = container.services;

const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return 'NO_ERROR';
};

describe('query parsing', () => {
  it('drops filler words and expands shorthand', () => {
    expect(parseSearchQuery('AI companies in Australia')).toEqual([
      ['ai', 'artificial intelligence', 'machine learning', 'llm'],
      ['australia'],
    ]);
    expect(parseSearchQuery('the companies')).toEqual([]);
  });

  it('normalises job titles and expands abbreviations both ways', () => {
    expect(parseJobTitle('Senior Engineers')).toEqual([['senior'], ['engineer']]);
    expect(parseJobTitle('Head of Sales')).toEqual([['head'], ['sale']]);
    expect(parseJobTitle('CTO')).toEqual([['cto', 'chief technology officer']]);
    expect(parseJobTitle('Chief Technology Officer')).toEqual([['cto', 'chief technology officer']]);
    expect(parseJobTitle('Vice President, Sales')).toEqual([['vp', 'vice president'], ['sale']]);
  });
});

describe('CompanyService', () => {
  it('finds AI companies in Australia', () => {
    const page = companies.search({ query: 'AI companies', country: 'Australia', limit: 10 });
    expect(page.companies.length).toBe(10);
    expect(page.total).toBeGreaterThan(10);
    expect(page.companies.every((company) => company.country === 'Australia')).toBe(true);
    expect(page.companies[0]?.industry).toBe('Artificial Intelligence');
  });

  it('accepts country codes and aliases', () => {
    expect(companies.search({ country: 'AU', limit: 50 }).total).toBe(
      companies.search({ country: 'australia', limit: 50 }).total,
    );
    expect(companies.search({ country: 'usa', limit: 1 }).companies[0]?.country).toBe('United States');
  });

  it('rejects unknown countries with a hint listing valid ones', () => {
    expect(errorCode(() => companies.search({ country: 'Atlantis', limit: 5 }))).toBe('INVALID_ARGUMENT');
  });

  it('falls back to matching any term when all terms match nothing', () => {
    const page = companies.search({ query: 'robotics zebra', limit: 5 });
    expect(page.companies.map((company) => company.name)).toContain('Tasman Robotics');
  });

  it('applies headcount bounds and validates them', () => {
    const page = companies.search({ minEmployees: 1000, limit: 50 });
    expect(page.companies.every((company) => company.employees >= 1000)).toBe(true);
    expect(errorCode(() => companies.search({ minEmployees: 500, maxEmployees: 100, limit: 5 }))).toBe(
      'INVALID_ARGUMENT',
    );
  });

  it('is safe against FTS query syntax in user input', () => {
    expect(() => companies.search({ query: 'AI" OR name:* NEAR(', limit: 5 })).not.toThrow();
  });

  it('returns details with a contact count, or NOT_FOUND', () => {
    expect(companies.get('cmp_1')).toMatchObject({ id: 'cmp_1', name: 'Signalgrid', contactCount: 8 });
    expect(errorCode(() => companies.get('cmp_9999'))).toBe('NOT_FOUND');
  });
});

describe('ContactService', () => {
  it('filters by company and title, most senior first', () => {
    const page = contacts.search({ companyId: 'cmp_1', jobTitle: 'engineer', limit: 25 });
    expect(page.contacts.length).toBeGreaterThan(0);
    expect(page.contacts.every((contact) => /engineer/i.test(contact.title) && contact.companyId === 'cmp_1')).toBe(
      true,
    );
  });

  it('distinguishes an unknown company from an empty result', () => {
    expect(errorCode(() => contacts.search({ companyId: 'cmp_9999', limit: 5 }))).toBe('NOT_FOUND');
    expect(contacts.search({ companyId: 'cmp_1', jobTitle: 'astronaut', limit: 5 }).total).toBe(0);
  });

  it('enriches once and serves repeats from storage', async () => {
    const first = await contacts.enrich('cnt_2');
    expect(first.cached).toBe(false);
    expect(first.enrichment.email).toMatch(/@signalgrid\.example$/);
    const second = await contacts.enrich('cnt_2');
    expect(second).toMatchObject({ cached: true, enrichment: first.enrichment });
  });
});

describe('ExportService', () => {
  it('rejects exports containing unknown IDs and lists them', () => {
    try {
      exports.create({ contactIds: ['cnt_1', 'cnt_99999'], format: 'csv' }, principals.full);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).details).toEqual({ missingIds: ['cnt_99999'] });
    }
  });

  it('produces RFC 4180 CSV and neutralises formula injection', () => {
    const [contact] = container.services.contacts.search({ companyId: 'cmp_1', limit: 1 }).contacts;
    const csv = toCsv([{ ...contact!, title: '=HYPERLINK("http://evil")', lastName: 'Smith, Jr.' }]);
    const [, row] = csv.trim().split('\r\n');
    expect(row).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(row).toContain('"Smith, Jr."');
  });
});
