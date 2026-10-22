import { parseArgs } from 'node:util';
import { ALL_SCOPES, isScope } from '../auth/scopes.js';
import { AppError } from '../domain/errors.js';
import { cliContainer, fail } from './bootstrap.js';

const USAGE = `Manage API keys.

Usage:
  npm run keys -- create --name <name> [--scopes <scope,scope>]
  npm run keys -- list
  npm run keys -- revoke <key-id>

Scopes: ${ALL_SCOPES.join(', ')} (default: all)`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { name: { type: 'string' }, scopes: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
});
const [command, ...rest] = positionals;

if (values.help || !command) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const container = cliContainer();
const { apiKeys } = container.services;

try {
  switch (command) {
    case 'create': {
      if (!values.name) fail('--name is required');
      const requested = values.scopes ? values.scopes.split(',').map((scope) => scope.trim()) : [...ALL_SCOPES];
      const invalid = requested.filter((scope) => !isScope(scope));
      if (invalid.length) fail(`unknown scope(s): ${invalid.join(', ')}`);

      const { record, key } = apiKeys.create({ name: values.name, scopes: requested.filter(isScope) });
      console.log(`Created API key ${record.id} "${record.name}" with scopes: ${record.scopes.join(' ')}`);
      console.log('\nStore this key now; it cannot be shown again:\n');
      console.log(`  ${key}\n`);
      break;
    }
    case 'list': {
      const rows = apiKeys.list().map((key) => ({
        id: key.id,
        name: key.name,
        prefix: `${key.prefix}…`,
        scopes: key.scopes.join(' '),
        lastUsed: key.lastUsedAt ?? 'never',
        status: key.revokedAt ? `revoked ${key.revokedAt}` : 'active',
      }));
      if (rows.length) console.table(rows);
      else console.log('No API keys. Create one with: npm run keys -- create --name <name>');
      break;
    }
    case 'revoke': {
      const [id] = rest;
      if (!id) fail('usage: npm run keys -- revoke <key-id>');
      apiKeys.revoke(id);
      console.log(`Revoked ${id}. Requests using it are now rejected with 401.`);
      break;
    }
    default:
      fail(`unknown command "${command}"\n\n${USAGE}`);
  }
} catch (error) {
  if (error instanceof AppError) fail(error.message);
  throw error;
} finally {
  container.close();
}
