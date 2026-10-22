import type { SearchTerm } from '../../repositories/companyRepository.js';

/**
 * Natural-language search parsing. LLM clients tend to send queries such as
 * "AI companies in Australia", so filler words are dropped and common
 * industry shorthand is expanded before the query reaches the FTS index.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'at', 'based', 'best', 'business', 'businesses', 'by', 'companies', 'company',
  'find', 'firm', 'firms', 'for', 'from', 'headquartered', 'in', 'is', 'list', 'located', 'me', 'of', 'on', 'or',
  'organisation', 'organisations', 'organization', 'organizations', 'show', 'some', 'startup', 'startups', 'that',
  'the', 'to', 'top', 'which', 'who', 'with',
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

/**
 * Splits a job-title filter into fragments that must all appear in the title.
 * Plurals are reduced ("engineers" -> "engineer") so either form matches.
 */
export function parseJobTitle(jobTitle: string | undefined): string[] {
  if (!jobTitle) return [];
  return [...new Set(tokenize(jobTitle))]
    .filter((token) => !TITLE_STOPWORDS.has(token))
    .map((token) => (token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token));
}
