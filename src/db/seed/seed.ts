import type { Db } from '../database.js';
import { CompanyRepository } from '../../repositories/companyRepository.js';
import { ContactRepository } from '../../repositories/contactRepository.js';
import { buildSeedData } from './generate.js';

/** Replaces all companies, contacts and exports with the deterministic seed dataset. API keys are kept. */
export function seedDatabase(db: Db): { companies: number; contacts: number } {
  const { companies, contacts } = buildSeedData();
  db.transaction(() => {
    db.exec('DELETE FROM exports; DELETE FROM contacts; DELETE FROM companies;');
    new CompanyRepository(db).insertMany(companies);
    new ContactRepository(db).insertMany(contacts);
  })();
  return { companies: companies.length, contacts: contacts.length };
}

export function isSeeded(db: Db): boolean {
  return (db.prepare('SELECT count(*) AS n FROM companies').get() as { n: number }).n > 0;
}
