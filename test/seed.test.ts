import { describe, expect, it } from 'vitest';
import { buildSeedData } from '../src/db/seed/generate.js';

describe('seed data', () => {
  const { companies, contacts } = buildSeedData();

  it('meets the minimum dataset size', () => {
    expect(companies.length).toBeGreaterThanOrEqual(50);
    expect(contacts.length).toBeGreaterThanOrEqual(200);
  });

  it('is deterministic', () => {
    expect(buildSeedData()).toEqual({ companies, contacts });
  });

  it('gives every company at least three contacts and unique domains', () => {
    for (const company of companies) {
      expect(contacts.filter((contact) => contact.companyId === company.id).length).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(companies.map((company) => company.domain)).size).toBe(companies.length);
  });

  it('only uses the reserved .example TLD', () => {
    expect(companies.every((company) => company.domain.endsWith('.example'))).toBe(true);
  });
});
