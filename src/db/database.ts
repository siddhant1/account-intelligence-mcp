import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

/**
 * Ordered schema migrations. The index + 1 is stored in `PRAGMA user_version`,
 * so a database is only ever migrated forward and each step runs exactly once.
 */
const MIGRATIONS: readonly string[] = [
  /* 1: core schema */ `
  CREATE TABLE companies (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    domain        TEXT NOT NULL UNIQUE,
    website       TEXT NOT NULL,
    industry      TEXT NOT NULL,
    employees     INTEGER NOT NULL CHECK (employees > 0),
    country       TEXT NOT NULL,
    city          TEXT NOT NULL,
    founded_year  INTEGER,
    description   TEXT NOT NULL,
    tags          TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_companies_country  ON companies (country COLLATE NOCASE);
  CREATE INDEX idx_companies_industry ON companies (industry COLLATE NOCASE);

  -- Full-text index over companies, kept in sync by triggers (external-content FTS5 table).
  CREATE VIRTUAL TABLE companies_fts USING fts5(
    name, industry, description, tags, city, country,
    content = 'companies', content_rowid = 'rowid', tokenize = 'porter unicode61'
  );
  CREATE TRIGGER companies_fts_insert AFTER INSERT ON companies BEGIN
    INSERT INTO companies_fts (rowid, name, industry, description, tags, city, country)
    VALUES (new.rowid, new.name, new.industry, new.description, new.tags, new.city, new.country);
  END;
  CREATE TRIGGER companies_fts_delete AFTER DELETE ON companies BEGIN
    INSERT INTO companies_fts (companies_fts, rowid, name, industry, description, tags, city, country)
    VALUES ('delete', old.rowid, old.name, old.industry, old.description, old.tags, old.city, old.country);
  END;
  CREATE TRIGGER companies_fts_update AFTER UPDATE ON companies BEGIN
    INSERT INTO companies_fts (companies_fts, rowid, name, industry, description, tags, city, country)
    VALUES ('delete', old.rowid, old.name, old.industry, old.description, old.tags, old.city, old.country);
    INSERT INTO companies_fts (rowid, name, industry, description, tags, city, country)
    VALUES (new.rowid, new.name, new.industry, new.description, new.tags, new.city, new.country);
  END;

  CREATE TABLE contacts (
    id            TEXT PRIMARY KEY,
    company_id    TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    title         TEXT NOT NULL,
    department    TEXT NOT NULL,
    seniority     TEXT NOT NULL,
    location      TEXT NOT NULL,
    -- Populated by enrich_contact; NULL until the contact has been enriched.
    email         TEXT,
    linkedin_url  TEXT,
    phone         TEXT,
    enriched_at   TEXT
  );
  CREATE INDEX idx_contacts_company ON contacts (company_id);

  CREATE TABLE api_keys (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    key_prefix    TEXT NOT NULL,
    key_hash      TEXT NOT NULL UNIQUE,
    scopes        TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    last_used_at  TEXT,
    revoked_at    TEXT
  );

  CREATE TABLE exports (
    id             TEXT PRIMARY KEY,
    api_key_id     TEXT NOT NULL REFERENCES api_keys (id),
    format         TEXT NOT NULL,
    contact_count  INTEGER NOT NULL,
    file_name      TEXT NOT NULL,
    content_type   TEXT NOT NULL,
    content        BLOB NOT NULL,
    created_at     TEXT NOT NULL,
    expires_at     TEXT NOT NULL
  );
  CREATE INDEX idx_exports_expires ON exports (expires_at);
  `,
];

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]!);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

/** Opens (creating if needed) and migrates the SQLite database. Pass `:memory:` for tests. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}
