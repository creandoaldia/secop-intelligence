import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const testDir = mkdtempSync(path.join(tmpdir(), "secop-source-health-"));
const dbPath = path.join(testDir, "secop.db");

beforeAll(() => {
  process.env.DB_PATH = dbPath;
  const database = new Database(dbPath);
  database.exec(`
    CREATE TABLE source_health (
      source TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL DEFAULT 'healthy',
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      consecutive_successes INTEGER NOT NULL DEFAULT 0,
      breaker_trip_count INTEGER NOT NULL DEFAULT 0,
      cooldown_until INTEGER,
      watermark_date TEXT,
      watermark_id TEXT,
      last_success_at INTEGER,
      last_failure_at INTEGER,
      last_error_message TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fuente TEXT NOT NULL,
      fecha_inicio INTEGER NOT NULL,
      fecha_fin INTEGER,
      registros_nuevos INTEGER DEFAULT 0,
      registros_actualizados INTEGER DEFAULT 0,
      errores INTEGER DEFAULT 0,
      metricas TEXT,
      estado TEXT DEFAULT 'running'
    );
  `);
  database.close();
});

afterAll(() => {
  // The module-level SQLite singleton closes with the Vitest worker on Windows.
  try { rmSync(testDir, { recursive: true, force: true }); } catch { /* cleanup is best effort */ }
});

const clientConfig = {
  baseUrl: "https://example.test/resource",
  datasetId: "dataset",
  delayMs: 0,
  jitterPct: 0,
  maxRetryAfterSeconds: 1,
};

describe("source health state machine", () => {
  it("persists healthy, degraded, and down transitions", async () => {
    const { SocrataClient } = await import("@/lib/secop/client");
    const { SocrataApiError } = await import("@/lib/secop/types");
    const { db } = await import("@/lib/db");
    const { sourceHealth } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const client = new SocrataClient(clientConfig);
    const failure = new SocrataApiError("upstream failure", 503);

    await client.reportFailure(failure);
    let health = await db.select().from(sourceHealth).where(eq(sourceHealth.source, "socrata")).get();
    expect(health).toMatchObject({ status: "degraded", consecutiveFailures: 1 });

    await client.reportFailure(failure);
    await client.reportFailure(failure);
    health = await db.select().from(sourceHealth).where(eq(sourceHealth.source, "socrata")).get();
    expect(health).toMatchObject({ status: "down", consecutiveFailures: 3, breakerTripCount: 1 });
    expect(health?.cooldownUntil).toBeInstanceOf(Date);
  });

  it("escalates cooldowns, resets after three successes, and avoids upstream calls while open", async () => {
    const { SocrataClient } = await import("@/lib/secop/client");
    const { SocrataApiError, SocrataCircuitOpenError } = await import("@/lib/secop/types");
    const { db } = await import("@/lib/db");
    const { sourceHealth } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const client = new SocrataClient(clientConfig);
    const failure = new SocrataApiError("upstream failure", 503);

    await db.delete(sourceHealth).run();
    for (let trip = 0; trip < 4; trip++) {
      await client.reportFailure(failure);
      await client.reportFailure(failure);
      await client.reportFailure(failure);
      const health = await db.select().from(sourceHealth).where(eq(sourceHealth.source, "socrata")).get();
      expect(health?.breakerTripCount).toBe(trip + 1);
      if (trip === 0) {
        await expect(client.fetchPage(0, 1)).rejects.toBeInstanceOf(SocrataCircuitOpenError);
      }
      await db.update(sourceHealth).set({ cooldownUntil: new Date(0) }).where(eq(sourceHealth.source, "socrata")).run();
      await client.reportSuccess();
    }

    // The final recovery above is the first of three consecutive successes.
    for (let success = 0; success < 2; success++) await client.reportSuccess();
    const health = await db.select().from(sourceHealth).where(eq(sourceHealth.source, "socrata")).get();
    expect(health).toMatchObject({ status: "healthy", breakerTripCount: 0, consecutiveSuccesses: 0 });
  });
});

describe("compound cursor and lease", () => {
  it("uses raw ISO timestamp and ID ties in the compound predicate", async () => {
    const { compoundWatermarkWhere } = await import("@/lib/secop/sync");
    expect(compoundWatermarkWhere("2026-01-01T00:00:00.123Z", "process-9")).toBe(
      "fecha_de_publicacion_del >= '2026-01-01T00:00:00.123Z' AND (fecha_de_publicacion_del > '2026-01-01T00:00:00.123Z' OR id_del_proceso > 'process-9')"
    );
  });

  it("falls back to full paging without a cursor and rejects a concurrent lease", async () => {
    const { runSync } = await import("@/lib/secop/sync");
    const { db } = await import("@/lib/db");
    const { sourceHealth, syncLog } = await import("@/lib/db/schema");
    await db.delete(syncLog).run();
    await db.delete(sourceHealth).run();

    let releaseFirstPage!: () => void;
    const firstPage = new Promise<never[]>((resolve) => { releaseFirstPage = () => resolve([]); });
    const client = {
      fetchPage: vi.fn(() => firstPage),
      reportSuccess: vi.fn(),
    };
    const first = runSync(client as never, { datasetId: "dataset", mode: "incremental" });
    const second = await runSync(client as never, { datasetId: "dataset", mode: "incremental" });
    expect(second.status).toBe("already_running");
    releaseFirstPage();
    await expect(first).resolves.toMatchObject({ status: "done" });
    expect(client.fetchPage).toHaveBeenCalledWith(0, 1000, undefined, { order: "fecha_de_publicacion_del ASC, id_del_proceso ASC" });
  });
});
