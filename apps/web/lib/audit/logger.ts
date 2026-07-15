// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Minimal Audit Logger
// Logs sensitive actions to the activity_log table
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export interface AuditEntry {
  action: string;
  userId?: string;
  entity: string;
  entityId?: string;
  metadata?: string;
}

/**
 * Log a sensitive action to the audit trail.
 * Uses raw SQL since activity_log is a simple append-only table.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    await db.run(
      sql`INSERT INTO activity_log (action, user_id, entity, entity_id, metadata, created_at)
          VALUES (${entry.action}, ${entry.userId ?? null}, ${entry.entity}, ${entry.entityId ?? null}, ${entry.metadata ?? null}, ${now})`
    );
  } catch (err) {
    // Audit should never break the app
    console.error("[AUDIT] Failed to log:", err);
  }
}
