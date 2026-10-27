import type { SearchTerm } from '../../repositories/companyRepository.js';

/**
 * Natural-language search parsing. LLM clients tend to send queries such as
 * "AI companies in Australia", so filler words are dropped and common
 * industry shorthand is expanded before the query reaches the FTS index.
 */

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'any',
  'are',
  'at',
  'based',
  'best',
  'business',
  'businesses',
  'by',
  'companies',
  'company',
  'find',
  'firm',
  'firms',
  'for',
  'from',
  'headquartered',
  'in',
  'is',
  'list',
  'located',
  'me',
  'of',
  'on',
  'or',
  'organisation',
  'organisations',
  'organization',
  'organizations',
  'show',
  'some',
  'startup',
  'startups',
  'that',
  'the',
  'to',
  'top',
  'which',
  'who',
  'with',
]);

const SYNONYMS: Record<string, readonly string[]> = {
  ai: ['ai', 'artificial intelligence', 'machine learning', 'llm'],
  ml: ['machine learning', 'ml'],
  llm: ['llm', 'large language models'],
  fintech: ['fintech', 'payments', 'banking', 'lending'],
  healthtech: ['healthtech', 'healthcare', 'telehealth'],
  edtech: ['edtech', 'education', 'learning'],
  cyber: ['cyber', 'cybersecurity', 'security'],
  ecommerce: ['ecommerce', 'commerce', 'marketplace'],
  saas: ['saas', 'software'],
  agtech: ['agtech', 'agritech', 'agriculture', 'farms'],
};

const MAX_TERMS = 8;

export function tokenize(text: string): string[] {
  const normalized = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function parseSearchQuery(query: string | undefined): SearchTerm[] {
  if (!query) return [];
  const tokens = [...new Set(tokenize(query))].filter((token) => !STOPWORDS.has(token));
  return tokens.slice(0, MAX_TERMS).map((token) => SYNONYMS[token] ?? [token]);
}

const TITLE_STOPWORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'the']);

/** Title abbreviations and the phrases they stand for; matching either form finds both. */
const TITLE_ABBREVIATIONS: Record<string, string> = {
  ceo: 'chief executive officer',
  cto: 'chief technology officer',
  cfo: 'chief financial officer',
  coo: 'chief operating officer',
  cmo: 'chief marketing officer',
  cro: 'chief revenue officer',
  vp: 'vice president',
  svp: 'senior vice president',
  swe: 'software engineer',
  sde: 'software engineer',
  pm: 'product manager',
  sdr: 'sales development representative',
  ae: 'account executive',
  ml: 'machine learning',
};

/** A job-title term matches when the title contains any of its alternatives (a word or a phrase). */
export type TitleTerm = readonly string[];

const singular = (token: string) =>
  token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token;

/**
 * Turns a job-title filter into terms that must all appear in the title. Plurals
 * are reduced ("engineers" -> "engineer") and abbreviations are expanded in both
 * directions, so "CTO" finds "Chief Technology Officer" and vice versa.
 */
export function parseJobTitle(jobTitle: string | undefined): TitleTerm[] {
  if (!jobTitle) return [];
  let text = ` ${tokenize(jobTitle).join(' ')} `;
  // Collapse spelled-out phrases to their abbreviation first, so they expand to both forms below.
  for (const [abbreviation, phrase] of Object.entries(TITLE_ABBREVIATIONS)) {
    text = text.replaceAll(` ${phrase} `, ` ${abbreviation} `);
  }
  const tokens = [...new Set(text.trim().split(' ').filter(Boolean))].filter((token) => !TITLE_STOPWORDS.has(token));
  return tokens.map((token) => {
    const abbreviation = TITLE_ABBREVIATIONS[token];
    return abbreviation ? [token, abbreviation] : [singular(token)];
  });
}
