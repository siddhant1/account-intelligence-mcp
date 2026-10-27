import { createHash, randomBytes } from 'node:crypto';
import type { Clock } from '../domain/clock.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { ApiKeyRecord, ApiKeyRepository } from '../repositories/apiKeyRepository.js';
import type { Principal, Scope } from './scopes.js';

export const API_KEY_PREFIX = 'aip_';
const API_KEY_PATTERN = /^aip_[A-Za-z0-9_-]{24,128}$/;
const DISPLAY_PREFIX_LENGTH = 12;
/** `last_used_at` is refreshed at most this often, so authentication does not write on every request. */
const LAST_USED_RESOLUTION_MS = 60_000;

export type AuthenticationResult =
  { ok: true; principal: Principal } | { ok: false; reason: 'missing' | 'malformed' | 'unknown' | 'revoked' };

/**
 * Keys are random 192-bit secrets, so a fast SHA-256 digest is enough to store
 * them safely (slow hashes such as bcrypt protect low-entropy passwords). Only
 * the digest and a short display prefix are kept; the plaintext is shown once.
 */
export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex');

export const generateApiKey = () => `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;

export class ApiKeyService {
  constructor(
    private readonly keys: ApiKeyRepository,
    private readonly clock: Clock,
  ) {}

  /** Creates a key and returns its plaintext. The plaintext cannot be recovered later. */
  create(input: { name: string; scopes: readonly Scope[]; key?: string }): { record: ApiKeyRecord; key: string } {
    const name = input.name.trim();
    if (!name) throw new ValidationError('API key name is required');
    if (input.scopes.length === 0) throw new ValidationError('An API key needs at least one scope');

    const key = input.key ?? generateApiKey();
    if (!API_KEY_PATTERN.test(key)) throw new ValidationError(`API keys must match ${API_KEY_PATTERN}`);

    const id = `key_${randomBytes(6).toString('hex')}`;
    this.keys.insert({
      id,
      name,
      prefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
      hash: hashApiKey(key),
      scopes: [...new Set(input.scopes)],
      createdAt: this.clock().toISOString(),
    });
    return { record: this.keys.findByHash(hashApiKey(key))!, key };
  }

  authenticate(rawKey: string | undefined): AuthenticationResult {
    if (!rawKey) return { ok: false, reason: 'missing' };
    if (!API_KEY_PATTERN.test(rawKey)) return { ok: false, reason: 'malformed' };

    const record = this.keys.findByHash(hashApiKey(rawKey));
    if (!record) return { ok: false, reason: 'unknown' };
    if (record.revokedAt) return { ok: false, reason: 'revoked' };

    const now = this.clock();
    if (!record.lastUsedAt || now.getTime() - Date.parse(record.lastUsedAt) >= LAST_USED_RESOLUTION_MS) {
      this.keys.touch(record.id, now.toISOString());
    }
    return { ok: true, principal: { apiKeyId: record.id, apiKeyName: record.name, scopes: record.scopes } };
  }

  /** Whether this exact key has been registered (active or revoked). */
  isRegistered(key: string): boolean {
    return this.keys.findByHash(hashApiKey(key)) !== undefined;
  }

  list(): ApiKeyRecord[] {
    return this.keys.list();
  }

  revoke(id: string): void {
    if (!this.keys.revoke(id, this.clock().toISOString())) {
      throw new NotFoundError(`No active API key with id ${id}`);
    }
  }
}
