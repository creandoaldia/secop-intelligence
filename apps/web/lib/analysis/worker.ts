// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Analysis Background Worker
// Polls pending jobs, processes through OCR → LLM → Verify
// Runs in the same Next.js process via interval
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { analysisJobs, analysisResults, procesos } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { analyzeDocumentFromUrl } from "@/lib/ocr/client";
import { extractFromDocument } from "@/lib/llm/extractor";
import { verifyExtraction } from "@/lib/llm/verifier";
import { logAudit } from "@/lib/audit/logger";

// ─── Types ─────────────────────────────────────────────────

export interface ExtractionResult {
  requisitosHabilitantes: Record<string, unknown>;
  garantias: Record<string, unknown>;
  cronograma: Record<string, unknown>;
  formaPago: Record<string, unknown>;
  experienciaRequerida: Record<string, unknown>;
  riesgos: Record<string, unknown>;
  resumen: string;
}

export interface VerificationResult {
  corrections: Record<string, unknown>;
  confianza: number;
  errores: string[];
}

// ─── Worker State ──────────────────────────────────────────

let workerInterval: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 10_000; // 10 seconds
const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes max per job
const MAX_RETRIES = 3;

// ─── Status Updates ────────────────────────────────────────

async function updateJobStatus(
  jobId: string,
  status: string,
  extra?: Partial<{ error: string; progress: number; pagesProcessed: number }>
): Promise<void> {
  const updateData: Record<string, unknown> = { estado: status };
  if (extra?.error) updateData.error = extra.error;
  if (extra?.progress !== undefined) {
    updateData.paginasProcesadas = sql`CAST(${extra.progress} * paginas_total / 100 AS INTEGER)`;
  }
  if (extra?.pagesProcessed !== undefined) {
    updateData.paginasProcesadas = extra.pagesProcessed;
  }
  await db.update(analysisJobs).set(updateData).where(eq(analysisJobs.id, jobId)).run();
}

// ─── Job Processing Pipeline ───────────────────────────────

async function processJob(jobId: string): Promise<void> {
  const job = await db
    .select()
    .from(analysisJobs)
    .where(eq(analysisJobs.id, jobId))
    .get();

  if (!job || job.estado !== "pending") return;

  // Lock: mark as downloading
  await updateJobStatus(jobId, "downloading");

  try {
    // ── Step 1: Get proceso URL ──────────────────────────
    const proceso = job.procesoId
      ? await db.select().from(procesos).where(eq(procesos.id, job.procesoId)).get()
      : null;

    if (!proceso?.urlPliego) {
      throw new Error("No se encontró URL de pliego para este proceso");
    }

    const pliegoUrl = proceso.urlPliego;

    // ── Step 2: OCR ──────────────────────────────────────
    await updateJobStatus(jobId, "ocr", { progress: 10 });

    let ocrContent: string;
    try {
      const ocrResult = await analyzeDocumentFromUrl(pliegoUrl);
      ocrContent = ocrResult.content;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`OCR falló: ${msg}`);
    }

    await updateJobStatus(jobId, "ocr", { progress: 35 });

    // ── Step 3: LLM Extraction ───────────────────────────
    await updateJobStatus(jobId, "extracting", { progress: 40 });

    let extraction: ExtractionResult;
    try {
      extraction = await extractFromDocument(ocrContent);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Extracción LLM falló: ${msg}`);
    }

    await updateJobStatus(jobId, "extracting", { progress: 70 });

    // ── Step 4: LLM Verification ─────────────────────────
    await updateJobStatus(jobId, "verifying", { progress: 75 });

    let verification: VerificationResult | null = null;
    try {
      verification = await verifyExtraction(
        extraction as unknown as Record<string, unknown>,
        ocrContent
      );
    } catch (error) {
      // Verification failure is non-fatal — result still usable
      console.warn(`[Analysis Worker] Verification failed for job ${jobId}:`, error);
      verification = null;
    }

    await updateJobStatus(jobId, "verifying", { progress: 90 });

    // ── Step 5: Save Results ─────────────────────────────
    const resultId = crypto.randomUUID();

    await db.insert(analysisResults).values({
      id: resultId,
      jobId,
      requisitosHabilitantes: JSON.stringify(extraction.requisitosHabilitantes),
      garantias: JSON.stringify(extraction.garantias),
      cronograma: JSON.stringify(extraction.cronograma),
      formaPago: JSON.stringify(extraction.formaPago),
      experienciaRequerida: JSON.stringify(extraction.experienciaRequerida),
      riesgos: JSON.stringify(extraction.riesgos),
      resumen: extraction.resumen,
      verificacion: verification ? JSON.stringify(verification.corrections) : null,
      confianza: verification?.confianza ?? null,
      modeloExtraccion: "gpt-4o-mini",
      modeloVerificacion: "claude-haiku",
    }).run();

    await updateJobStatus(jobId, "completed", { progress: 100 });

    await logAudit({
      action: "analysis.completed",
      userId: job.userId,
      entity: "analysis_job",
      entityId: jobId,
      metadata: JSON.stringify({ procesoId: job.procesoId, confianza: verification?.confianza }),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Analysis Worker] Job ${jobId} failed:`, msg);

    // Check retry count
    const retryCount = job.error ? parseInt(job.error.split("|")[0] ?? "0", 10) : 0;

    if (retryCount < MAX_RETRIES - 1) {
      // Retry: reset to pending with incremented retry counter
      await db.update(analysisJobs).set({
        estado: "pending",
        error: `${retryCount + 1}|${msg}`,
      }).where(eq(analysisJobs.id, jobId)).run();
    } else {
      await updateJobStatus(jobId, "failed", {
        error: `Máximos reintentos (${MAX_RETRIES}) alcanzados: ${msg}`,
      });
    }
  }
}

// ─── Polling Loop ──────────────────────────────────────────

async function pollPendingJobs(): Promise<void> {
  const staleThreshold = new Date(Date.now() - JOB_TIMEOUT_MS);

  try {
    // Find all pending jobs, ordered by creation date (FIFO)
    const pendingJobs = await db
      .select({ id: analysisJobs.id, createdAt: analysisJobs.createdAt })
      .from(analysisJobs)
      .where(
        and(
          eq(analysisJobs.estado, "pending"),
          // Exclude jobs that have exceeded timeout with retries
          sql`${analysisJobs.createdAt} > ${staleThreshold.getTime() / 1000}`
        )
      )
      .orderBy(analysisJobs.createdAt)
      .limit(5) // Process max 5 per poll cycle
      .all();

    for (const job of pendingJobs) {
      await processJob(job.id);
    }
  } catch (error) {
    console.error("[Analysis Worker] Poll error:", error);
  }
}

// ─── Worker Lifecycle ──────────────────────────────────────

let isRunning = false;

export function startWorker(): void {
  if (workerInterval) {
    console.warn("[Analysis Worker] Already running");
    return;
  }

  isRunning = true;
  console.log("[Analysis Worker] Started — polling every", POLL_INTERVAL_MS, "ms");

  // Immediate first poll, then interval
  pollPendingJobs();
  workerInterval = setInterval(pollPendingJobs, POLL_INTERVAL_MS);
}

export function stopWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    isRunning = false;
    console.log("[Analysis Worker] Stopped");
  }
}

export function isWorkerRunning(): boolean {
  return isRunning;
}

// ─── Cleanup stale jobs on boot ────────────────────────────

export async function cleanupStaleJobs(): Promise<number> {
  const staleThreshold = new Date(Date.now() - JOB_TIMEOUT_MS);

  const result = await db.update(analysisJobs)
    .set({
      estado: "failed",
      error: "Job cancelado por timeout (30 min sin procesar)",
    })
    .where(
      and(
        sql`${analysisJobs.estado} IN ('pending', 'downloading', 'ocr', 'extracting', 'verifying')`,
        sql`${analysisJobs.createdAt} < ${Math.floor(staleThreshold.getTime() / 1000)}`
      )
    )
    .run();

  return result.changes ?? 0;
}
