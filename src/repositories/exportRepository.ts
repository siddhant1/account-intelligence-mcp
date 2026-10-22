import type { Db } from '../db/database.js';
import type { ExportFormat, ExportRecord } from '../domain/types.js';

interface ExportRow {
  id: string;
  api_key_id: string;
  format: ExportFormat;
  contact_count: number;
  file_name: string;
  content_type: string;
  content: Buffer;
  created_at: string;
  expires_at: string;
}

const toRecord = (row: ExportRow): ExportRecord => ({
  id: row.id,
  apiKeyId: row.api_key_id,
  format: row.format,
  contactCount: row.contact_count,
  fileName: row.file_name,
  contentType: row.content_type,
  content: row.content,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
});

/**
 * Stores generated export files. SQLite keeps the demo self-contained; in
 * production this would be object storage (S3/GCS) with presigned URLs.
 */
export class ExportRepository {
  private readonly insertStmt;
  private readonly byId;
  private readonly purge;

  constructor(db: Db) {
    this.insertStmt = db.prepare(
      `INSERT INTO exports (id, api_key_id, format, contact_count, file_name, content_type, content, created_at, expires_at)
       VALUES (@id, @apiKeyId, @format, @contactCount, @fileName, @contentType, @content, @createdAt, @expiresAt)`,
    );
    this.byId = db.prepare<[string], ExportRow>('SELECT * FROM exports WHERE id = ?');
    this.purge = db.prepare('DELETE FROM exports WHERE expires_at < ?');
  }

  insert(record: ExportRecord): void {
    this.insertStmt.run(record);
  }

  findById(id: string): ExportRecord | undefined {
    const row = this.byId.get(id);
    return row ? toRecord(row) : undefined;
  }

  /** Deletes exports whose links expired before `before`. Returns the number removed. */
  deleteExpired(before: string): number {
    return this.purge.run(before).changes;
  }
}
