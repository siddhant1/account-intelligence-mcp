import { READ_ONLY_SCOPES, ALL_SCOPES, type Scope } from '../auth/scopes.js';
import { hashApiKey } from '../auth/apiKeyService.js';
import { seedDatabase } from '../db/seed/seed.js';
import { cliContainer, fail } from './bootstrap.js';

/**
 * Loads the sample dataset and, in development, registers the dev API keys
 * from .env (DEV_API_KEY / DEV_READONLY_API_KEY) so the examples work as-is.
 */
const container = cliContainer();
const { config, db, services } = container;

if (config.env === 'production') fail('refusing to seed a production database');

const counts = seedDatabase(db);
console.log(`Seeded ${counts.companies} companies and ${counts.contacts} contacts into ${config.databasePath}`);

const devKeys: [string, string | undefined, readonly Scope[]][] = [
  ['Development (full access)', process.env.DEV_API_KEY, ALL_SCOPES],
  ['Development (read-only)', process.env.DEV_READONLY_API_KEY, READ_ONLY_SCOPES],
];

for (const [name, key, scopes] of devKeys) {
  if (!key) continue;
  const known = db.prepare('SELECT 1 FROM api_keys WHERE key_hash = ?').get(hashApiKey(key));
  if (known) {
    console.log(`API key "${name}" already registered`);
    continue;
  }
  const { record } = services.apiKeys.create({ name, scopes, key });
  console.log(`Registered API key "${name}" (${record.prefix}…) with scopes: ${scopes.join(' ')}`);
}

container.close();
