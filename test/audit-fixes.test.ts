import { describe, expect, it } from 'vitest';
import { AppError } from '../src/domain/errors.js';
import { ContactRepository } from '../src/repositories/contactRepository.js';
import {
  SimulatedEnrichmentProvider,
  type EnrichmentProvider,
  type EnrichmentRequest,
} from '../src/services/enrichment/enrichmentProvider.js';
import { toCsv } from '../src/services/exportService.js';
import { createTestContainer } from './helpers.js';

/** Regression tests for defects found in the adversarial audit. */

const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return 'NO_ERROR';
};

describe('job title search', () => {
  const { container } = createTestContainer();
  const { contacts } = container.services;
  const count = (title: string) =>
    (container.db.prepare('SELECT count(*) AS n FROM contacts WHERE title = ?').get(title) as { n: number }).n;
  const titles = (jobTitle: string, companyId?: string) =>
    contacts.search({ jobTitle, companyId, limit: 100 }).contacts.map((contact) => contact.title);

  it('finds CTOs whether asked for "CTO" or "Chief Technology Officer"', () => {
    const ctos = count('Chief Technology Officer');
    expect(ctos).toBeGreaterThan(0);
    expect(titles('CTO')).toHaveLength(ctos);
    expect(titles('chief technology officer')).toHaveLength(ctos);
  });

  it('finds every CEO, however the title is written', () => {
    // One CEO per company: "Co-Founder & CEO" or "Chief Executive Officer".
    expect(contacts.search({ jobTitle: 'CEO', limit: 100 }).total).toBe(62);
    expect(contacts.search({ jobTitle: 'Chief Executive Officer', limit: 100 }).total).toBe(62);
  });

  it('matches "Vice President" to "VP of ..." titles', () => {
    const found = titles('Vice President');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((title) => title.startsWith('VP of'))).toBe(true);
  });

  it('matches whole words only for abbreviations ("cto" is not inside "Director")', () => {
    new ContactRepository(container.db).insertMany([
      {
        id: 'cnt_9001',
        companyId: 'cmp_5',
        firstName: 'Test',
        lastName: 'Director',
        title: 'Director of Technology',
        department: 'engineering',
        seniority: 'director',
        location: 'Sydney, Australia',
      },
    ]);
    expect(titles('CTO', 'cmp_5')).not.toContain('Director of Technology');
    expect(titles('Director', 'cmp_5')).toContain('Director of Technology');
  });

  it('ranks whole-word matches before partial ones ("Engineer" before "VP of Engineering")', () => {
    const found = titles('Engineer', 'cmp_29');
    const firstPartial = found.findIndex((title) => !/\bEngineers?\b/.test(title));
    expect(firstPartial).toBeGreaterThan(0);
    expect(found.slice(firstPartial).every((title) => !/\bEngineers?\b/.test(title))).toBe(true);
  });

  it('still lists contacts when no title filter is given', () => {
    expect(contacts.search({ companyId: 'cmp_1', limit: 100 }).total).toBe(8);
  });
});

describe('industry and country filters', () => {
  const { companies } = createTestContainer().container.services;
  const industries = (industry: string) =>
    new Set(companies.search({ industry, limit: 50 }).companies.map((company) => company.industry));

  it('resolves shorthand, punctuation-free and partial industry names', () => {
    expect(industries('AI')).toEqual(new Set(['Artificial Intelligence']));
    expect(industries('ecommerce')).toEqual(new Set(['E-commerce']));
    expect(industries('health')).toEqual(new Set(['Healthcare']));
    expect([...industries('tech')].every((name) => /tech/i.test(name))).toBe(true);
    expect(industries('tech').size).toBeGreaterThan(2);
  });

  it('rejects unknown or too-short industries with the valid list', () => {
    for (const industry of ['xyz', 'in']) {
      try {
        companies.search({ industry, limit: 5 });
        expect.unreachable();
      } catch (error) {
        expect((error as AppError).code).toBe('INVALID_ARGUMENT');
        expect((error as AppError).hint).toContain('Artificial Intelligence');
      }
    }
  });

  it('accepts dotted country codes', () => {
    expect(companies.resolveCountry('U.S.')).toBe('United States');
    expect(companies.resolveCountry('u.k.')).toBe('United Kingdom');
    expect(companies.resolveCountry('New-Zealand')).toBe('New Zealand');
    expect(errorCode(() => companies.resolveCountry('Narnia'))).toBe('INVALID_ARGUMENT');
  });
});

describe('enrichment', () => {
  class CountingProvider implements EnrichmentProvider {
    readonly name = 'counting';
    calls = 0;
    private readonly inner = new SimulatedEnrichmentProvider(25);
    enrich(request: EnrichmentRequest) {
      this.calls += 1;
      return this.inner.enrich(request);
    }
  }

  it('makes one provider call for concurrent requests about the same contact', async () => {
    const provider = new CountingProvider();
    const { contacts } = createTestContainer({}, { enrichmentProvider: provider }).container.services;
    const results = await Promise.all(Array.from({ length: 10 }, () => contacts.enrich('cnt_40')));
    expect(provider.calls).toBe(1);
    expect(results.filter((result) => !result.cached)).toHaveLength(1);
    expect(new Set(results.map((result) => result.enrichment.email)).size).toBe(1);
  });

  it('always returns an email and LinkedIn profile', async () => {
    const { contacts } = createTestContainer().container.services;
    for (let id = 1; id <= 60; id++) {
      const { enrichment } = await contacts.enrich(`cnt_${id}`);
      expect(enrichment.email).toMatch(/^[a-z0-9.]+@[a-z0-9]+\.example$/);
      expect(enrichment.linkedin).toMatch(/^https:\/\/www\.linkedin\.com\/in\/[a-z0-9-]+$/);
    }
  });
});

describe('CSV export cells', () => {
  const { container } = createTestContainer();
  const [contact] = container.services.contacts.search({ companyId: 'cmp_1', limit: 1 }).contacts;
  const enriched = (phone: string, title = 'Engineer') =>
    toCsv([{ ...contact!, title, enrichment: { email: 'a@b.example', linkedin: null, phone, enrichedAt: 'x' } }]);

  it('keeps phone numbers intact', () => {
    expect(enriched('+61 412 345 678')).toContain(',+61 412 345 678,');
  });

  it('still neutralises formulas, including ones that start with + or -', () => {
    expect(enriched('+1', "-1+cmd|' /C calc'!A0")).toContain(`'-1+cmd|' /C calc'!A0`);
    expect(enriched('+1', '+HYPERLINK("http://evil")')).toContain(`"'+HYPERLINK(""http://evil"")"`);
  });
});

describe('API key last-used tracking', () => {
  it('writes last_used_at at most once a minute', () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const { container, keys } = createTestContainer({}, { clock: () => now });
    const { apiKeys } = container.services;
    const lastUsed = () => apiKeys.list().find((key) => key.name === 'test-full')!.lastUsedAt;

    apiKeys.authenticate(keys.full);
    expect(lastUsed()).toBe('2026-01-01T00:00:00.000Z');
    now = new Date('2026-01-01T00:00:30Z');
    apiKeys.authenticate(keys.full);
    expect(lastUsed()).toBe('2026-01-01T00:00:00.000Z');
    now = new Date('2026-01-01T00:01:01Z');
    apiKeys.authenticate(keys.full);
    expect(lastUsed()).toBe('2026-01-01T00:01:01.000Z');
  });
});
