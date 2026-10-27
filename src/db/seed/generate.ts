import type { Company, Contact, Department, Seniority } from '../../domain/types.js';
import { SEED_COMPANIES } from './companies.js';

/**
 * Deterministic seed data: the same companies and contacts (and therefore the
 * same IDs) on every run, so docs and tests can reference them.
 */

const FIRST_NAMES = [
  'Olivia',
  'Liam',
  'Amelia',
  'Noah',
  'Isla',
  'Jack',
  'Mia',
  'William',
  'Ava',
  'Oliver',
  'Charlotte',
  'Thomas',
  'Grace',
  'Lachlan',
  'Chloe',
  'Ethan',
  'Zoe',
  'Lucas',
  'Ruby',
  'Mason',
  'Priya',
  'Arjun',
  'Ananya',
  'Rohan',
  'Mei',
  'Wei',
  'Hiroshi',
  'Yuki',
  'Min-jun',
  'Seo-yeon',
  'Aroha',
  'Tane',
  'Fatima',
  'Omar',
  'Layla',
  'Yusuf',
  'Sofia',
  'Mateo',
  'Valentina',
  'Diego',
  'Elena',
  'Lukas',
  'Hannah',
  'Felix',
  'Niamh',
  'Cian',
  'Aisha',
  'Kwame',
  'Amara',
  'Tariq',
  'Sienna',
  'Harper',
  'Declan',
  'Freya',
  'Kai',
  'Leilani',
  'Nikhil',
  'Sakura',
  'Javier',
  'Ingrid',
];

const LAST_NAMES = [
  'Smith',
  'Nguyen',
  'Williams',
  'Brown',
  'Wilson',
  'Taylor',
  'Johnson',
  'White',
  'Martin',
  'Anderson',
  'Thompson',
  'Walker',
  'Harris',
  'Lee',
  'Ryan',
  'Robinson',
  'Kelly',
  'King',
  'Patel',
  'Sharma',
  'Singh',
  'Chen',
  'Wang',
  'Li',
  'Tanaka',
  'Kim',
  'Park',
  'Ngata',
  'Parata',
  'Haddad',
  'Rahman',
  'Khan',
  'Garcia',
  'Rodriguez',
  'Lopez',
  'Rossi',
  'Muller',
  'Schmidt',
  'Fischer',
  "O'Brien",
  'Murphy',
  'Byrne',
  'Okafor',
  'Mensah',
  'Campbell',
  'MacDonald',
  'Fraser',
  'Morales',
  'Novak',
  'Kowalski',
  'Andersen',
  'Lindqvist',
  'Costa',
  'Silva',
  'Ito',
  'Iyer',
  'Reddy',
  'Gupta',
  'Dubois',
  'Laurent',
];

interface Role {
  title: string;
  department: Department;
  seniority: Seniority;
}

const role = (title: string, department: Department, seniority: Seniority): Role => ({ title, department, seniority });

const ENGINEERING_ICS = [
  role('Software Engineer', 'engineering', 'individual_contributor'),
  role('Senior Software Engineer', 'engineering', 'senior'),
  role('Staff Engineer', 'engineering', 'senior'),
  role('Data Engineer', 'engineering', 'individual_contributor'),
  role('DevOps Engineer', 'engineering', 'individual_contributor'),
  role('Senior Backend Engineer', 'engineering', 'senior'),
  role('Frontend Engineer', 'engineering', 'individual_contributor'),
];
const ML_ENGINEER = role('Machine Learning Engineer', 'engineering', 'senior');

const SALES = [
  role('Head of Sales', 'sales', 'director'),
  role('Account Executive', 'sales', 'individual_contributor'),
  role('Senior Account Executive', 'sales', 'senior'),
  role('VP of Sales', 'sales', 'vp'),
  role('Sales Development Representative', 'sales', 'individual_contributor'),
];

const MARKETING_AND_PRODUCT = [
  role('Head of Marketing', 'marketing', 'director'),
  role('Marketing Manager', 'marketing', 'manager'),
  role('Growth Marketing Lead', 'marketing', 'senior'),
  role('Product Manager', 'product', 'individual_contributor'),
  role('Senior Product Manager', 'product', 'senior'),
  role('Head of Product', 'product', 'director'),
];

const OTHERS = [
  role('Engineering Manager', 'engineering', 'manager'),
  role('Principal Engineer', 'engineering', 'senior'),
  role('Customer Success Manager', 'operations', 'manager'),
  role('Head of People', 'operations', 'director'),
  role('Chief Financial Officer', 'executive', 'executive'),
  role('Operations Manager', 'operations', 'manager'),
  role('Product Designer', 'product', 'individual_contributor'),
  role('Chief Operating Officer', 'executive', 'executive'),
];

/** mulberry32: tiny, fast, seedable PRNG. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  return { next, pick };
}

const toDomain = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example`;

function contactCountFor(employees: number): number {
  if (employees < 60) return 3;
  if (employees < 200) return 4;
  if (employees < 600) return 5;
  return 6;
}

function rolesFor(company: Company, count: number, random: ReturnType<typeof createRandom>): Role[] {
  const isAi = company.tags.some((tag) => /\b(ai|machine learning|llm)\b/i.test(tag));
  const roles: Role[] = [
    company.foundedYear && company.foundedYear >= 2015
      ? role('Co-Founder & CEO', 'executive', 'executive')
      : role('Chief Executive Officer', 'executive', 'executive'),
    company.employees < 150
      ? role('Chief Technology Officer', 'executive', 'executive')
      : role('VP of Engineering', 'engineering', 'vp'),
    isAi && random.next() < 0.6 ? ML_ENGINEER : random.pick(ENGINEERING_ICS),
    random.pick(SALES),
    random.pick(MARKETING_AND_PRODUCT),
  ];
  while (roles.length < count) {
    const pool = random.next() < 0.5 ? ENGINEERING_ICS : OTHERS;
    const candidate = random.pick(pool);
    if (!roles.some((existing) => existing.title === candidate.title)) roles.push(candidate);
  }
  return roles.slice(0, count);
}

export function buildSeedData(): { companies: Company[]; contacts: Omit<Contact, 'enrichment'>[] } {
  const random = createRandom(20_261_022);

  const companies: Company[] = SEED_COMPANIES.map(
    ([name, industry, country, city, employees, foundedYear, tags, description], index) => {
      const domain = toDomain(name);
      return {
        id: `cmp_${index + 1}`,
        name,
        domain,
        website: `https://www.${domain}`,
        industry,
        employees,
        country,
        city,
        foundedYear,
        description,
        tags: tags.split(','),
      };
    },
  );

  const contacts: Omit<Contact, 'enrichment'>[] = [];
  for (const company of companies) {
    // The first company gets a larger team so examples have more to show.
    const count = company.id === 'cmp_1' ? 8 : contactCountFor(company.employees);
    const usedNames = new Set<string>();

    for (const { title, department, seniority } of rolesFor(company, count, random)) {
      let firstName: string;
      let lastName: string;
      do {
        firstName = random.pick(FIRST_NAMES);
        lastName = random.pick(LAST_NAMES);
      } while (usedNames.has(`${firstName} ${lastName}`));
      usedNames.add(`${firstName} ${lastName}`);

      const remote = seniority !== 'executive' && random.next() < 0.15;
      contacts.push({
        id: `cnt_${contacts.length + 1}`,
        companyId: company.id,
        firstName,
        lastName,
        title,
        department,
        seniority,
        location: remote ? `Remote, ${company.country}` : `${company.city}, ${company.country}`,
      });
    }
  }

  return { companies, contacts };
}
