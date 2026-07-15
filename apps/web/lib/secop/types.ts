// ─── Socrata API Types ─────────────────────────────────────

// Raw Socrata API response row for dataset p6dx-8zbt (SECOP II - Procesos de Contratacion)
export interface SocrataProcessRow {
  entidad?: string;
  nit_entidad?: string;
  departamento_entidad?: string;
  ciudad_entidad?: string;
  id_del_proceso?: string;
  referencia_del_proceso?: string;
  nombre_del_procedimiento?: string;
  descripci_n_del_procedimiento?: string;
  fase?: string;
  fecha_de_publicacion_del?: string;       // ISO date
  fecha_de_ultima_publicaci?: string;       // ISO date - for incremental sync
  precio_base?: string;                     // numeric string
  modalidad_de_contratacion?: string;
  duracion?: string;
  unidad_de_duracion?: string;
  ciudad_de_la_unidad_de?: string;
  nombre_de_la_unidad_de?: string;
  estado_del_procedimiento?: string;
  estado_resumen?: string;
  tipo_de_contrato?: string;
  subtipo_de_contrato?: string;
  codigo_principal_de_categoria?: string;
  codigo_entidad?: string;
  urlproceso?: { url: string } | string;
  adjudicado?: string;
  valor_total_adjudicacion?: string;
  nombre_del_proveedor?: string;
  nit_del_proveedor_adjudicado?: string;
  ultima_actualizacion?: string;            // for incremental $where filter
  // Allow unknown fields (silently ignored by mapper)
  [key: string]: unknown;
}

// Error response from SODA API
export interface SocrataErrorResponse {
  error: boolean;
  message: string;
  code?: string;
}

// ─── Error Hierarchy ───────────────────────────────────────

export class SocrataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocrataError";
  }
}

export class SocrataApiError extends SocrataError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = "SocrataApiError";
  }
}

export class SocrataRateLimitError extends SocrataApiError {
  constructor(
    message: string,
    statusCode: number,       // always 429
    public readonly retryAfterSeconds: number,
    public readonly retryCount: number,
    public readonly retryHistory: number[],  // previous wait times in ms
    responseBody?: string
  ) {
    super(message, statusCode, responseBody);
    this.name = "SocrataRateLimitError";
  }
}

export class SocrataTimeoutError extends SocrataError {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = "SocrataTimeoutError";
  }
}

export class SocrataNetworkError extends SocrataError {
  constructor(
    message: string,
    public readonly cause: Error
  ) {
    super(message);
    this.name = "SocrataNetworkError";
  }
}

export class SyncStallError extends SocrataError {
  constructor(
    message: string,
    public readonly consecutiveEmptyPages: number,
    public readonly lastOffset: number
  ) {
    super(message);
    this.name = "SyncStallError";
  }
}

// ─── Rate Limiter & Client Config ──────────────────────────

export interface SocrataClientConfig {
  baseUrl: string;
  datasetId: string;
  appToken?: string;
  delayMs: number;
  jitterPct: number;
  maxRetryAfterSeconds: number;
}

// ─── Sync Types ────────────────────────────────────────────

export type SyncStatus = "done" | "error" | "partial" | "already_running" | "rate_limited" | "stalled";

export interface SyncMetrics {
  lastProcessedOffset: number;
  totalRequests: number;
  rateLimitHits: number;
  retriesTriggered: number;
  totalWaitTimeMs: number;
  avgRequestTimeMs: number;
  newIdsSeenSample: string[];  // capped at 10
  consecutiveStalePages: number;
}

export interface SyncResult {
  status: SyncStatus;
  nuevos: number;
  actualizados: number;
  errores: number;
  metricas: SyncMetrics;
  error?: string;
}

export interface SyncConfig {
  datasetId: string;
  mode: "full" | "incremental";
  pageSize?: number;           // default 1000, max 1000
  stallThreshold?: number;     // default 3
  signal?: AbortSignal;
}
