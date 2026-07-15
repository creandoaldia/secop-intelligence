// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Database Client Singleton
// better-sqlite3 + WAL mode + Drizzle ORM
// ─────────────────────────────────────────────────────────────

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "secop.db");

// Singleton pattern — una unica instancia en toda la app
const globalForDb = globalThis as unknown as {
  _dbClient: Database.Database | undefined;
};

function getClient(): Database.Database {
  if (!globalForDb._dbClient) {
    const client = new Database(DB_PATH);

    // WAL mode para mejor concurrencia de lecturas
    client.pragma("journal_mode = WAL");
    // Timeout de 5s para escrituras concurrentes
    client.pragma("busy_timeout = 5000");
    // Foreign keys on
    client.pragma("foreign_keys = ON");

    globalForDb._dbClient = client;
  }
  return globalForDb._dbClient;
}

const client = getClient();
export const db = drizzle(client, { schema });

// ─── HELPER: check connection ───────────────────────────────

export function isDbConnected(): boolean {
  try {
    client.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}

// ─── HELPER: get DB stats ───────────────────────────────────

export interface DbStats {
  totalProcesos: number;
  totalUsuarios: number;
  totalAnalisis: number;
}

export function getDbStats(): DbStats {
  const procesos = client.prepare("SELECT COUNT(*) as count FROM procesos").get() as { count: number };
  const usuarios = client.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  const analisis = client.prepare("SELECT COUNT(*) as count FROM analysis_jobs").get() as { count: number };
  return {
    totalProcesos: procesos.count,
    totalUsuarios: usuarios.count,
    totalAnalisis: analisis.count,
  };
}
