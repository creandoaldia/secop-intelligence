// ─────────────────────────────────────────────────────────────
// Tests: Analysis Worker Lifecycle (T7)
// Validates stage progression, pagesTotal persistence, retry
// logic, cleanup, and stale job handling
// ─────────────────────────────────────────────────────────────

import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module-level mocks (hoisted) ───────────────────────────

vi.mock("@/lib/ocr/client", () => ({
  analyzeDocumentFromUrl: vi.fn(),
}));

vi.mock("@/lib/llm/extractor", () => ({
  extractFromDocument: vi.fn(),
}));

vi.mock("@/lib/llm/verifier", () => ({
  verifyExtraction: vi.fn(),
}));

vi.mock("@/lib/secop/download-client", () => ({
  downloadPliegoToTemp: vi.fn(),
}));

vi.mock("@/lib/audit/logger", () => ({
  logAudit: vi.fn(),
}));

// ─── Test data ──────────────────────────────────────────────

const PROCESO_ID = "proceso-test-1";
const JOB_ID = "job-test-1";
const USER_ID = "user-test-1";
const POLL_TIMEOUT = 5000;

// ─── DB setup ───────────────────────────────────────────────

let testDir: string;
let dbPath: string;
let db: Database.Database;

/** Wait for a job to reach an expected status (polling loop) */
async function waitForJobStatus(
  database: Database.Database,
  jobId: string,
  expectedStatus: string,
  timeoutMs = POLL_TIMEOUT,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = database
      .prepare("SELECT estado FROM analysis_jobs WHERE id = ?")
      .get(jobId) as { estado: string } | undefined;
    if (row && row.estado === expectedStatus) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(
    `Timeout (${timeoutMs}ms) waiting for job ${jobId} to reach "${expectedStatus}"`,
  );
}

/** Insert a proceso row */
function insertProceso(
  database: Database.Database,
  overrides: Partial<{ urlPliego: string; urlSecop: string; nombre: string }> = {},
): void {
  database
    .prepare(
      `INSERT INTO procesos (id, nombre, url_pliego, url_secop, created_at)
       VALUES (?, ?, ?, ?, strftime('%s','now'))`,
    )
    .run(
      PROCESO_ID,
      overrides.nombre ?? "Test Proceso",
      overrides.urlPliego ?? "https://example.com/pliego.pdf",
      overrides.urlSecop ?? null,
    );
}

/** Insert an analysis job row */
function insertJob(
  database: Database.Database,
  overrides: Partial<{
    id: string;
    userId: string;
    procesoId: string;
    estado: string;
    paginasTotal: number;
    paginasProcesadas: number;
    error: string | null;
    createdAt: number;
  }> = {},
): void {
  const defaults = {
    id: JOB_ID,
    userId: USER_ID,
    procesoId: PROCESO_ID,
    estado: "pending",
    paginasTotal: 10,
    paginasProcesadas: 0,
    error: null as string | null,
    createdAt: Math.floor(Date.now() / 1000),
  };
  const final = { ...defaults, ...overrides };

  database
    .prepare(
      `INSERT INTO analysis_jobs (id, user_id, proceso_id, estado, paginas_total, paginas_procesadas, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      final.id,
      final.userId,
      final.procesoId,
      final.estado,
      final.paginasTotal,
      final.paginasProcesadas,
      final.error,
      final.createdAt,
    );
}

beforeAll(() => {
  testDir = mkdtempSync(path.join(tmpdir(), "analysis-worker-"));
  dbPath = path.join(testDir, "test.db");

  // Set env vars BEFORE the worker module is first imported
  process.env.DB_PATH = dbPath;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.AZURE_OCR_ENDPOINT = "https://test.cognitiveservices.azure.com";
  process.env.AZURE_OCR_KEY = "test-azure-key";
  process.env.LLM_MODEL = "deepseek/deepseek-v4-flash";
  process.env.ANALYSIS_POLL_INTERVAL = "50";
  process.env.ANALYSIS_RETENTION_DAYS = "1";

  // Create tables matching the drizzle schema
  const raw = new Database(dbPath);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = OFF");
  raw.exec(`
    CREATE TABLE IF NOT EXISTS analysis_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      proceso_id TEXT,
      estado TEXT NOT NULL DEFAULT 'pending',
      paginas_total INTEGER DEFAULT 0,
      paginas_procesadas INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      completed_at INTEGER,
      error TEXT,
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS analysis_results (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      requisitos_habilitantes TEXT,
      garantias TEXT,
      cronograma TEXT,
      forma_pago TEXT,
      experiencia_requerida TEXT,
      riesgos TEXT,
      resumen TEXT,
      verificacion TEXT,
      confianza REAL,
      modelo_extraccion TEXT DEFAULT 'gpt-4o-mini',
      modelo_verificacion TEXT DEFAULT 'claude-haiku',
      feedback_usuario TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS procesos (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      entidad_id TEXT,
      entidad_nombre TEXT,
      valor INTEGER,
      moneda TEXT DEFAULT 'COP',
      estado TEXT,
      modalidad TEXT,
      fecha_publicacion INTEGER,
      fecha_cierre INTEGER,
      fecha_adjudicacion INTEGER,
      categoria_unspc TEXT,
      ubicacion TEXT,
      departamento TEXT,
      url_secop TEXT,
      url_pliego TEXT,
      hash_contenido TEXT,
      fuente TEXT DEFAULT 'socrata',
      version INTEGER DEFAULT 1,
      datos_raw TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
  raw.close();
});

afterAll(() => {
  try {
    if (db) db.close();
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    /* cleanup is best effort */
  }
});

beforeEach(async () => {
  // Open a fresh connection for test assertions
  db = new Database(dbPath);
  db.pragma("foreign_keys = OFF");
  db.exec(
    "DELETE FROM analysis_jobs; DELETE FROM analysis_results; DELETE FROM procesos;",
  );

  // Ensure worker is stopped from previous test
  const { isWorkerRunning, stopWorker } = await import("@/lib/analysis/worker");
  if (isWorkerRunning()) stopWorker();

  vi.clearAllMocks();
});

afterEach(async () => {
  const { isWorkerRunning, stopWorker } = await import("@/lib/analysis/worker");
  if (isWorkerRunning()) stopWorker();
  if (db) db.close();
});

// ─── Tests ───────────────────────────────────────────────────

describe("T7 — Worker lifecycle", () => {
  describe("Stage progression", () => {
    it("transitions through all 6 stages from pending to completed", async () => {
      // Arrange: mock all external services (with tiny delays for macrotask boundaries)
      const { analyzeDocumentFromUrl } = await import("@/lib/ocr/client");
      const { extractFromDocument } = await import("@/lib/llm/extractor");
      const { verifyExtraction } = await import("@/lib/llm/verifier");

      const tinyDelay = () => new Promise((r) => setTimeout(r, 5));

      vi.mocked(analyzeDocumentFromUrl).mockImplementation(async () => {
        await tinyDelay();
        return { pages: 5, content: "Documento de prueba con contenido simulado.", tables: [] };
      });
      vi.mocked(extractFromDocument).mockImplementation(async () => {
        await tinyDelay();
        return {
          requisitosHabilitantes: {},
          garantias: {},
          cronograma: {},
          formaPago: {},
          experienciaRequerida: {},
          riesgos: {},
          resumen: "Resumen simulado.",
        };
      });
      vi.mocked(verifyExtraction).mockImplementation(async () => {
        await tinyDelay();
        return { corrections: {}, confianza: 0.92, errores: [] };
      });

      insertProceso(db, { urlPliego: "https://example.com/pliego.pdf" });
      insertJob(db);

      // Act
      const { startWorker } = await import("@/lib/analysis/worker");
      startWorker();

      // Verify intermediate states were reached by waiting sequentially
      // (5ms mock delays provide macrotask boundaries between stages)
      await waitForJobStatus(db, JOB_ID, "verifying");
      await waitForJobStatus(db, JOB_ID, "completed");

      // Assert: final state
      const job = db
        .prepare("SELECT * FROM analysis_jobs WHERE id = ?")
        .get(JOB_ID) as Record<string, unknown>;
      expect(job.estado).toBe("completed");

      // Assert: each pipeline stage was invoked
      expect(vi.mocked(analyzeDocumentFromUrl)).toHaveBeenCalledOnce();
      expect(vi.mocked(extractFromDocument)).toHaveBeenCalledOnce();
      expect(vi.mocked(verifyExtraction)).toHaveBeenCalledOnce();

      // Assert: result was persisted
      const result = db
        .prepare("SELECT * FROM analysis_results WHERE job_id = ?")
        .get(JOB_ID) as Record<string, unknown> | undefined;
      expect(result).toBeDefined();
      expect(result?.requisitos_habilitantes).toBeDefined();
      expect(result?.modelo_extraccion).toBe("deepseek/deepseek-v4-flash");
    });
  });

  describe("PagesTotal persistence", () => {
    it("persists pagesTotal = 12 after OCR returns 12 pages", async () => {
      const { analyzeDocumentFromUrl } = await import("@/lib/ocr/client");
      const { extractFromDocument } = await import("@/lib/llm/extractor");
      const { verifyExtraction } = await import("@/lib/llm/verifier");

      vi.mocked(analyzeDocumentFromUrl).mockResolvedValue({
        pages: 12,
        content: "Contenido de 12 paginas simulado.",
        tables: [],
      });
      vi.mocked(extractFromDocument).mockResolvedValue({
        requisitosHabilitantes: {},
        garantias: {},
        cronograma: {},
        formaPago: {},
        experienciaRequerida: {},
        riesgos: {},
        resumen: "Resumen.",
      });
      vi.mocked(verifyExtraction).mockResolvedValue({
        corrections: {},
        confianza: 0.9,
        errores: [],
      });

      insertProceso(db);
      insertJob(db, { paginasTotal: 1 }); // initial placeholder

      const { startWorker } = await import("@/lib/analysis/worker");
      startWorker();

      await waitForJobStatus(db, JOB_ID, "completed");

      const job = db
        .prepare("SELECT * FROM analysis_jobs WHERE id = ?")
        .get(JOB_ID) as Record<string, unknown>;
      expect(job.paginas_total).toBe(12);
    });

    it("falls back to pagesTotal = 1 when OCR returns 0 pages", async () => {
      const { analyzeDocumentFromUrl } = await import("@/lib/ocr/client");
      const { extractFromDocument } = await import("@/lib/llm/extractor");
      const { verifyExtraction } = await import("@/lib/llm/verifier");

      vi.mocked(analyzeDocumentFromUrl).mockResolvedValue({
        pages: 0,
        content: "Contenido simulado (sin deteccion de paginas).",
        tables: [],
      });
      vi.mocked(extractFromDocument).mockResolvedValue({
        requisitosHabilitantes: {},
        garantias: {},
        cronograma: {},
        formaPago: {},
        experienciaRequerida: {},
        riesgos: {},
        resumen: "Resumen.",
      });
      vi.mocked(verifyExtraction).mockResolvedValue({
        corrections: {},
        confianza: 0.85,
        errores: [],
      });

      insertProceso(db);
      insertJob(db, { paginasTotal: 5 }); // NOT 1 — verifies fallback overwrites it

      const { startWorker } = await import("@/lib/analysis/worker");
      startWorker();

      await waitForJobStatus(db, JOB_ID, "completed");

      const job = db
        .prepare("SELECT * FROM analysis_jobs WHERE id = ?")
        .get(JOB_ID) as Record<string, unknown>;
      expect(job.paginas_total).toBe(1); // Math.max(1, 0) overrides 5
    });
  });

  describe("Failure with retry", () => {
    it("resets to pending on failure and reaches terminal failed after max retries", async () => {
      const { analyzeDocumentFromUrl } = await import("@/lib/ocr/client");
      const { extractFromDocument } = await import("@/lib/llm/extractor");

      vi.mocked(analyzeDocumentFromUrl).mockResolvedValue({
        pages: 3,
        content: "Contenido simulado.",
        tables: [],
      });
      // Extraction always throws — triggers retry each time
      vi.mocked(extractFromDocument).mockRejectedValue(
        new Error("Error de extraccion simulado"),
      );

      insertProceso(db);
      insertJob(db);

      const { startWorker } = await import("@/lib/analysis/worker");
      startWorker();

      // Wait for terminal failure (after ANALYSIS_MAX_RETRIES = 3 total attempts)
      await waitForJobStatus(db, JOB_ID, "failed");

      const job = db
        .prepare("SELECT * FROM analysis_jobs WHERE id = ?")
        .get(JOB_ID) as Record<string, unknown>;

      expect(job.estado).toBe("failed");
      expect((job.error as string) ?? "").toContain("Máximos reintentos");

      // Should have been called exactly 3 times (1 initial + 2 retries)
      expect(vi.mocked(extractFromDocument)).toHaveBeenCalledTimes(3);
    });
  });

  describe("Cleanup", () => {
    it("deletes only terminal jobs past retention, leaves recent jobs", async () => {
      const NOW = Math.floor(Date.now() / 1000);
      const TWO_DAYS = 2 * 24 * 60 * 60;

      // Insert old completed job (should be deleted)
      insertJob(db, {
        id: "old-completed",
        estado: "completed",
        createdAt: NOW - TWO_DAYS,
      });
      // Insert recent failed job (should survive, within 1-day retention)
      insertJob(db, {
        id: "recent-failed",
        estado: "failed",
        createdAt: NOW,
      });
      // Insert active job (should survive — not terminal)
      insertJob(db, {
        id: "active-pending",
        estado: "pending",
        createdAt: NOW - TWO_DAYS,
      });
      // Insert recent completed job (should survive — within 1-day retention)
      insertJob(db, {
        id: "recent-completed",
        estado: "completed",
        createdAt: NOW,
      });

      const { cleanupOldJobs } = await import("@/lib/analysis/worker");
      await cleanupOldJobs();

      // The old completed job should be gone
      const oldCompleted = db
        .prepare("SELECT id FROM analysis_jobs WHERE id = ?")
        .get("old-completed");
      expect(oldCompleted).toBeUndefined();

      // Recent failed job survives
      const recentFailed = db
        .prepare("SELECT id FROM analysis_jobs WHERE id = ?")
        .get("recent-failed");
      expect(recentFailed).toBeDefined();

      // Active pending job survives (not terminal)
      const activePending = db
        .prepare("SELECT id FROM analysis_jobs WHERE id = ?")
        .get("active-pending");
      expect(activePending).toBeDefined();

      // Recent completed job survives
      const recentCompleted = db
        .prepare("SELECT id FROM analysis_jobs WHERE id = ?")
        .get("recent-completed");
      expect(recentCompleted).toBeDefined();
    });
  });

  describe("Stale cleanup", () => {
    it("marks timed-out processing jobs as failed, leaves recent jobs", async () => {
      const NOW = Math.floor(Date.now() / 1000);
      const ONE_HOUR = 3600;
      const FIVE_MIN = 300;

      // Old pending job (should be marked failed — created 1 hour ago, >30min timeout)
      insertJob(db, {
        id: "old-pending",
        estado: "pending",
        createdAt: NOW - ONE_HOUR,
      });
      // Recent downloading job (should survive — 5 min ago, <30min timeout)
      insertJob(db, {
        id: "recent-downloading",
        estado: "downloading",
        createdAt: NOW - FIVE_MIN,
      });
      // Old completed job (should be left alone — not a processing state)
      insertJob(db, {
        id: "old-completed",
        estado: "completed",
        createdAt: NOW - ONE_HOUR,
      });

      const { cleanupStaleJobs } = await import("@/lib/analysis/worker");
      await cleanupStaleJobs();

      // Old pending → failed
      const oldPending = db
        .prepare("SELECT estado, error FROM analysis_jobs WHERE id = ?")
        .get("old-pending") as Record<string, unknown>;
      expect(oldPending.estado).toBe("failed");
      expect((oldPending.error as string) ?? "").toContain("timeout");

      // Recent downloading — unchanged
      const recentDownloading = db
        .prepare("SELECT estado FROM analysis_jobs WHERE id = ?")
        .get("recent-downloading") as Record<string, unknown>;
      expect(recentDownloading.estado).toBe("downloading");

      // Old completed — left alone (already terminal)
      const oldCompleted = db
        .prepare("SELECT estado FROM analysis_jobs WHERE id = ?")
        .get("old-completed") as Record<string, unknown>;
      expect(oldCompleted.estado).toBe("completed");
    });
  });
});
