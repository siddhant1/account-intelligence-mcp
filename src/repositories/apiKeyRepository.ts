import type { Db } from '../db/database.js';
import { isScope, type Scope } from '../auth/scopes.js';

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  /** First characters of the key, safe to display and log for identification. */
  prefix: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const toRecord = (row: ApiKeyRow): ApiKeyRecord => ({
  id: row.id,
  name: row.name,
  prefix: row.key_prefix,
  scopes: row.scopes.split(' ').filter(isScope),
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
});

export class ApiKeyRepository {
  private readonly insertStmt;
  private readonly byHash;
  private readonly all;
  private readonly revokeStmt;
  private readonly touchStmt;

  constructor(db: Db) {
    this.insertStmt = db.prepare(
      `INSERT INTO api_keys (id, name, key_prefix, key_hash, scopes, created_at)
       VALUES (@id, @name, @prefix, @hash, @scopes, @createdAt)`,
    );
    this.byHash = db.prepare<[string], ApiKeyRow>('SELECT * FROM api_keys WHERE key_hash = ?');
    this.all = db.prepare<[], ApiKeyRow>('SELECT * FROM api_keys ORDER BY created_at');
    this.revokeStmt = db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL');
    this.touchStmt = db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?');
  }

  insert(input: { id: string; name: string; prefix: string; hash: string; scopes: readonly Scope[]; createdAt: string }) {
    this.insertStmt.run({ ...input, scopes: input.scopes.join(' ') });
  }

  findByHash(hash: string): ApiKeyRecord | undefined {
    const row = this.byHash.get(hash);
    return row ? toRecord(row) : undefined;
  }

  list(): ApiKeyRecord[] {
    return this.all.all().map(toRecord);
  }

  /** Returns false when the key does not exist or was already revoked. */
  revoke(id: string, at: string): boolean {
    return this.revokeStmt.run(at, id).changes > 0;
  }

  touch(id: string, at: string): void {
    this.touchStmt.run(at, id);
  }
}
