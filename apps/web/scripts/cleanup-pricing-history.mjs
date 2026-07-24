#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Cleanup Pricing History
//
// Prunes snapshots older than a configurable threshold (default
// 365 days), keeping at most 1 snapshot per proceso per week
// before the cutoff. Recent snapshots (within threshold) are
// untouched.
//
// Usage:
//   node scripts/cleanup-pricing-history.mjs
//   THRESHOLD_DAYS=180 node scripts/cleanup-pricing-history.mjs
//   DB_PATH=./data/test.db node scripts/cleanup-pricing-history.mjs
// ─────────────────────────────────────────────────────────────

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "secop.db");
const THRESHOLD_DAYS = parseInt(process.env.THRESHOLD_DAYS || "365", 10);

// ─── DB Connection ─────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ─── Cleanup ───────────────────────────────────────────────

function runCleanup() {
  const cutoff = Math.floor(Date.now() / 1000) - THRESHOLD_DAYS * 86400;
  let removed = 0;

  // Find all proceso_ids that have snapshots before the cutoff
  const procesoIds = db
    .prepare(
      `SELECT DISTINCT proceso_id FROM proceso_pricing_history WHERE observed_at < ?`
    )
    .all(cutoff)
    .map((r) => r.proceso_id);

  for (const procesoId of procesoIds) {
    // Get all snapshots for this proceso before cutoff, ordered newest first
    const oldSnapshots = db
      .prepare(
        `SELECT id, observed_at FROM proceso_pricing_history
         WHERE proceso_id = ? AND observed_at < ?
         ORDER BY observed_at DESC`
      )
      .all(procesoId, cutoff);

    // Group by ISO week (using week number derived from observed_at)
    // Keep the newest snapshot per week
    const toKeep = new Set();
    const weeksSeen = new Set();

    for (const snap of oldSnapshots) {
      // Compute ISO week number from the UNIX timestamp
      const d = new Date(snap.observed_at * 1000);
      const weekKey = getISOWeekKey(d);

      if (!weeksSeen.has(weekKey)) {
        weeksSeen.add(weekKey);
        toKeep.add(snap.id);
      }
    }

    // Delete snapshots not in the keep set
    const idsToDelete = oldSnapshots
      .filter((s) => !toKeep.has(s.id))
      .map((s) => s.id);

    if (idsToDelete.length > 0) {
      const placeholders = idsToDelete.map(() => "?").join(",");
      const info = db
        .prepare(
          `DELETE FROM proceso_pricing_history WHERE id IN (${placeholders})`
        )
        .run(...idsToDelete);
      removed += info.changes;
    }
  }

  console.log(
    `Cleanup complete. Threshold: ${THRESHOLD_DAYS}d, Removed: ${removed} rows`
  );
  return { removed };
}

/**
 * Get an ISO-week-like key from a Date object.
 * Format: "YYYY-Www" (e.g., "2026-W30")
 */
function getISOWeekKey(d) {
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d - yearStart) / 86400000);
  const weekNum = Math.ceil((dayOfYear + yearStart.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ─── Main ──────────────────────────────────────────────────

try {
  const result = runCleanup();
  process.exit(0);
} catch (err) {
  console.error("Cleanup failed:", err.message);
  process.exit(1);
} finally {
  db.close();
}
