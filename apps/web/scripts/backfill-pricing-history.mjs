#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Backfill Pricing History
//
// Idempotent one-time snapshot for every proceso with non-null
// valor. Uses updatedAt as the observation timestamp (the moment
// we last synced the value). Safe to re-run: skips procesos that
// already have any pricing snapshot (sync-captured or backfilled).
//
// Usage:
//   node scripts/backfill-pricing-history.mjs
//   DB_PATH=./data/test.db node scripts/backfill-pricing-history.mjs
// ─────────────────────────────────────────────────────────────

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "secop.db");

// ─── DB Connection ─────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ─── Backfill ──────────────────────────────────────────────

function runBackfill() {
  // Find procesos that already have at least one pricing snapshot (idempotent guard)
  const alreadyBackfilled = new Set(
    db
      .prepare(
        `SELECT DISTINCT proceso_id FROM proceso_pricing_history`
      )
      .all()
      .map((r) => r.proceso_id)
  );

  // Find procesos with non-null valor that haven't been backfilled
  const rows = db
    .prepare(
      `SELECT id, valor, updated_at FROM procesos WHERE valor IS NOT NULL ORDER BY id`
    )
    .all();

  let inserted = 0;
  let skipped = 0;

  const insertStmt = db.prepare(`
    INSERT INTO proceso_pricing_history (proceso_id, valor, observed_at, source)
    VALUES (?, ?, ?, 'backfill')
  `);

  const tx = db.transaction(() => {
    for (const row of rows) {
      if (alreadyBackfilled.has(row.id)) {
        skipped++;
        continue;
      }
      // Use updated_at as observation time, fall back to current time
      const observedAt = row.updated_at ?? Math.floor(Date.now() / 1000);
      insertStmt.run(row.id, row.valor, observedAt);
      inserted++;
    }
  });

  tx();

  console.log(`Backfill complete. Inserted: ${inserted}, Skipped (already have snapshot): ${skipped}`);
  return { inserted, skipped };
}

// ─── Main ──────────────────────────────────────────────────

try {
  const result = runBackfill();
  process.exit(result.inserted > 0 ? 0 : 0); // Always exit 0 — idempotent is safe
} catch (err) {
  console.error("Backfill failed:", err.message);
  process.exit(1);
} finally {
  db.close();
}
