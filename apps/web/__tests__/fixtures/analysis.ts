// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Test Fixtures: Analysis Pipeline
// Factory functions producing typed objects matching the DB row
// shapes returned by GET /api/analysis/[id]
// ─────────────────────────────────────────────────────────────

// ─── Types (mirrors drizzle-orm InferSelectModel) ───────────

export type AnalysisJobStatus =
  | "pending"
  | "downloading"
  | "ocr"
  | "extracting"
  | "verifying"
  | "completed"
  | "failed";

export interface AnalysisJob {
  id: string;
  userId: string;
  procesoId: string | null;
  estado: AnalysisJobStatus;
  paginasTotal: number;
  paginasProcesadas: number;
  createdAt: number; // epoch seconds
  completedAt: number | null;
  error: string | null;
  metadata: string | null; // JSON string
}

export interface AnalysisResult {
  id: string;
  jobId: string;
  requisitosHabilitantes: string | null; // JSON
  garantias: string | null;
  cronograma: string | null;
  formaPago: string | null;
  experienciaRequerida: string | null;
  riesgos: string | null;
  resumen: string | null;
  verificacion: string | null; // JSON
  confianza: number | null;
  modeloExtraccion: string;
  modeloVerificacion: string;
  feedbackUsuario: string | null;
  createdAt: number; // epoch seconds
}

export interface AnalysisApiResponse {
  job: AnalysisJob;
  result: AnalysisResult | null;
}

// ─── Constants ──────────────────────────────────────────────

const DEFAULT_USER_ID = "test-user-id";
const DEFAULT_PROCESO_ID = "test-proceso-id";

// ─── Helpers ─────────────────────────────────────────────────

/** Current time in epoch seconds */
function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

/** Deterministic incremental ID for test reproducibility */
let idCounter = 0;
export function nextTestId(prefix = "test"): string {
  return `${prefix}-${++idCounter}`;
}

/** Reset the ID counter (call in beforeEach when needed) */
export function resetTestIds(): void {
  idCounter = 0;
}

/**
 * Build a default extraction JSON payload for mock results.
 * Returns a JSON-stringified object matching the extraction schema.
 */
export function defaultRequisitosHabilitantes(): string {
  return JSON.stringify({
    documentos: ["cedula", "rut", "certificado_afiliacion"],
    estado: "completo",
    observaciones: [],
  });
}

export function defaultGarantias(): string {
  return JSON.stringify({
    tipo: "seriedad_oferta",
    valor: "10%",
    vigente: true,
  });
}

export function defaultCronograma(): string {
  return JSON.stringify({
    fechaApertura: "2026-03-01",
    fechaCierre: "2026-04-15",
    fechaAdjudicacion: "2026-05-01",
  });
}

export function defaultFormaPago(): string {
  return JSON.stringify({
    tipo: "contado",
    porcentajeAnticipo: 30,
    porcentajeFinal: 70,
  });
}

export function defaultExperienciaRequerida(): string {
  return JSON.stringify({
    anos: 5,
    tipo: "especifica",
    descripcion: "Experiencia en proyectos similares de infraestructura",
  });
}

export function defaultRiesgos(): string {
  return JSON.stringify([
    { riesgo: "Incumplimiento de cronograma", probabilidad: "media", impacto: "alto" },
    { riesgo: "Sobre costos", probabilidad: "baja", impacto: "medio" },
  ]);
}

// ─── Job Factory ─────────────────────────────────────────────

/**
 * Create a mock AnalysisJob with sensible defaults.
 * Pass `overrides` to customise any field, including status.
 *
 * @example
 *   createMockJob()                           // "pending" status
 *   createMockJob({ estado: "completed" })    // terminal
 *   createMockJob({ paginasTotal: 1 })        // single-page
 */
export function createMockJob(overrides?: Partial<AnalysisJob>): AnalysisJob {
  return {
    id: nextTestId("job"),
    userId: DEFAULT_USER_ID,
    procesoId: DEFAULT_PROCESO_ID,
    estado: "pending",
    paginasTotal: 10,
    paginasProcesadas: 0,
    createdAt: nowEpoch(),
    completedAt: null,
    error: null,
    metadata: null,
    ...overrides,
  };
}

// ─── Status-specific Job Factories ───────────────────────────

export function createPendingJob(overrides?: Partial<AnalysisJob>): AnalysisJob {
  return createMockJob({ estado: "pending", ...overrides });
}

export function createDownloadingJob(overrides?: Partial<AnalysisJob>): AnalysisJob {
  return createMockJob({ estado: "downloading", paginasProcesadas: 1, ...overrides });
}

export function createOcrJob(overrides?: Partial<AnalysisJob>): AnalysisJob {
  return createMockJob({ estado: "ocr", paginasProcesadas: 3, ...overrides });
}

export function createExtractingJob(overrides?: Partial<AnalysisJob>): AnalysisJob {
  return createMockJob({ estado: "extracting", paginasProcesadas: 5, ...overrides });
}

export function createVerifyingJob(overrides?: Partial<AnalysisJob>): AnalysisJob {
  return createMockJob({ estado: "verifying", paginasProcesadas: 8, ...overrides });
}

export function createCompletedJob(overrides?: Partial<AnalysisJob>): AnalysisJob {
  const job = createMockJob({
    estado: "completed",
    paginasProcesadas: 10,
    completedAt: nowEpoch(),
    ...overrides,
  });
  return job;
}

export function createFailedJob(
  errorMsg?: string,
  overrides?: Partial<AnalysisJob>
): AnalysisJob {
  return createMockJob({
    estado: "failed",
    error: errorMsg ?? "Error simulado para pruebas",
    completedAt: nowEpoch(),
    ...overrides,
  });
}

// ─── Result Factory ──────────────────────────────────────────

/**
 * Create a mock AnalysisResult with sensible defaults.
 * Pass `overrides` to customise any field.
 */
export function createMockResult(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return {
    id: nextTestId("result"),
    jobId: "",
    requisitosHabilitantes: defaultRequisitosHabilitantes(),
    garantias: defaultGarantias(),
    cronograma: defaultCronograma(),
    formaPago: defaultFormaPago(),
    experienciaRequerida: defaultExperienciaRequerida(),
    riesgos: defaultRiesgos(),
    resumen: "Resumen simulado del pliego de condiciones.",
    verificacion: null,
    confianza: null,
    modeloExtraccion: "deepseek/deepseek-v4-flash",
    modeloVerificacion: "deepseek/deepseek-v4-flash",
    feedbackUsuario: null,
    createdAt: nowEpoch(),
    ...overrides,
  };
}

/**
 * Create a completed mock result with a realistic confidence score
 * and verification data, simulating a fully processed analysis.
 */
export function createCompletedResult(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return createMockResult({
    verificacion: JSON.stringify({
      correcciones: [],
      errores: [],
      nota: "Verificacion exitosa — datos correctos",
    }),
    confianza: 0.92,
    ...overrides,
  });
}

/**
 * Create a result with low confidence (simulating poor extraction).
 */
export function createLowConfidenceResult(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return createMockResult({
    verificacion: JSON.stringify({
      correcciones: [
        { campo: "requisitosHabilitantes", original: "A", corregido: "B" },
      ],
      errores: ["Campo 'garantias' no encontrado en el documento"],
      nota: "Se encontraron discrepancias significativas",
    }),
    confianza: 0.45,
    resumen: null,
    ...overrides,
  });
}

// ─── Progress Factory ───────────────────────────────────────

/**
 * Create a mock AnalysisJobProgress payload matching what the
 * tracker component receives via SSE / polling progress field.
 */
export function createMockProgress(
  status: AnalysisJobStatus,
  overrides?: Partial<{
    jobId: string;
    progress: number;
    pagesTotal: number;
    pagesProcessed: number;
    error: string;
  }>
): {
  jobId: string;
  status: AnalysisJobStatus;
  progress: number;
  pagesTotal: number;
  pagesProcessed: number;
  error?: string;
} {
  const progressMap: Record<AnalysisJobStatus, number> = {
    pending: 0,
    downloading: 15,
    ocr: 35,
    extracting: 70,
    verifying: 90,
    completed: 100,
    failed: 0,
  };

  return {
    jobId: nextTestId("progress"),
    status,
    progress: progressMap[status],
    pagesTotal: 10,
    pagesProcessed: status === "completed" ? 10 : status === "failed" ? 3 : 5,
    ...overrides,
  };
}
