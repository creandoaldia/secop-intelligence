// ─────────────────────────────────────────────────────────────
// CookieStore — Persistent cookie cache for SECOP sessions
// Uses SQLite to store session cookies with expiry
// ─────────────────────────────────────────────────────────────

import { join } from "path";
import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";

export interface StoredCookie {
  key: string;
  cookieValue: string;
  expiresAt: Date;
  createdAt: Date;
}

export class CookieStore {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? join(process.cwd(), "data", "secop-cookies.db");
  }

  async init(): Promise<void> {
    // Handle in-memory databases (for testing)
    if (this.dbPath === ":memory:") {
      this.db = new Database(":memory:");
      this.db.pragma("journal_mode = WAL");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cookies (
          key TEXT PRIMARY KEY,
          cookie_value TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )
      `);
      return;
    }

    const dir = this.dbPath.includes("\\")
      ? this.dbPath.substring(0, this.dbPath.lastIndexOf("\\"))
      : this.dbPath.includes("/")
        ? this.dbPath.substring(0, this.dbPath.lastIndexOf("/"))
        : process.cwd();

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cookies (
        key TEXT PRIMARY KEY,
        cookie_value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )
    `);
  }

  /** Save a cookie with expiry. */
  async save(key: string, cookieValue: string, expiresAt: Date): Promise<void> {
    if (!this.db) throw new Error("CookieStore not initialized");

    this.db
      .prepare(
        `INSERT OR REPLACE INTO cookies (key, cookie_value, expires_at)
         VALUES (?, ?, ?)`
      )
      .run(key, cookieValue, Math.floor(expiresAt.getTime() / 1000));
  }

  /** Load a cookie if it hasn't expired. Returns null if expired or not found. */
  async load(key: string): Promise<StoredCookie | null> {
    if (!this.db) throw new Error("CookieStore not initialized");

    const row = this.db
      .prepare("SELECT * FROM cookies WHERE key = ?")
      .get(key) as Record<string, unknown> | undefined;

    if (!row) return null;

    const expiresAt = new Date((row.expires_at as number) * 1000);
    if (expiresAt <= new Date()) {
      // Expired — clean it up and return null
      this.db.prepare("DELETE FROM cookies WHERE key = ?").run(key);
      return null;
    }

    return {
      key: row.key as string,
      cookieValue: row.cookie_value as string,
      expiresAt,
      createdAt: new Date((row.created_at as number) * 1000),
    };
  }

  /** Delete a cookie by key. */
  async delete(key: string): Promise<void> {
    if (!this.db) throw new Error("CookieStore not initialized");
    this.db.prepare("DELETE FROM cookies WHERE key = ?").run(key);
  }

  /** List all valid (non-expired) cookies. */
  async listValid(): Promise<StoredCookie[]> {
    if (!this.db) throw new Error("CookieStore not initialized");

    const rows = this.db
      .prepare("SELECT * FROM cookies WHERE expires_at > strftime('%s','now')")
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      key: row.key as string,
      cookieValue: row.cookie_value as string,
      expiresAt: new Date((row.expires_at as number) * 1000),
      createdAt: new Date((row.created_at as number) * 1000),
    }));
  }

  /** Close the database connection. */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
