// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Shared Constants
// Single source of truth for time windows, limits, and config
// ─────────────────────────────────────────────────────────────

// ─── Time windows (milliseconds) ───────────────────────────
export const ONE_MINUTE_MS = 60_000;
export const FIVE_MINUTES_MS = 300_000;
export const ONE_HOUR_MS = 3_600_000;
export const ONE_DAY_MS = 86_400_000;
export const THIRTY_DAYS_MS = 2_592_000_000;

// ─── Session ───────────────────────────────────────────────
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

// ─── Rate Limit Presets ────────────────────────────────────
// Format: { maxRequests, windowMs }
export const RL_STRICT = { maxRequests: 5, windowMs: ONE_HOUR_MS };    // Create/critical actions
export const RL_MODERATE = { maxRequests: 20, windowMs: ONE_HOUR_MS }; // Mutations
export const RL_STANDARD = { maxRequests: 30, windowMs: ONE_MINUTE_MS }; // Reads/list
export const RL_GENEROUS = { maxRequests: 60, windowMs: ONE_MINUTE_MS }; // Heavy reads
export const RL_DEFAULT = { maxRequests: 100, windowMs: ONE_MINUTE_MS };

// ─── Pagination ────────────────────────────────────────────
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;
export const PAGE_SIZE_SOCRATA = 1000;
export const SOCRATA_MAX_CONCURRENCY = 1;

// ─── Sync ──────────────────────────────────────────────────
export const SYNC_STALL_THRESHOLD = 3;
export const SYNC_MAX_RETRIES = 5;
export const SYNC_STALE_TIMEOUT_MINUTES = 10;
export const SYNC_POLL_INTERVAL_MS = 10_000;
export const SYNC_JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const ANALYSIS_JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const BREAKER_COOLDOWN_MS = [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000, 3 * 60 * 60 * 1000];
export const BREAKER_MAX_FAILURES = 3;
export const BREAKER_RESET_SUCCESSES = 3;

// ─── Helpers ────────────────────────────────────────────────
/** Safely parse a positive integer from an env var, defaulting on invalid/missing values */
function safeEnvInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ─── Analysis ──────────────────────────────────────────────
export const ANALYSIS_POLL_INTERVAL_MS = safeEnvInt(process.env.ANALYSIS_POLL_INTERVAL, 10_000);
export const ANALYSIS_RETENTION_DAYS = safeEnvInt(process.env.ANALYSIS_RETENTION_DAYS, 30);
export const CLEANUP_INTERVAL_MS = 21_600_000;
export const ANALYSIS_MAX_RETRIES = 3;
export const ANALYSIS_OCR_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const ANALYSIS_MAX_TOKENS_OCR = 120_000;
export const ANALYSIS_MAX_TOKENS_LLM = 8_000;
export const ANALYSIS_MAX_TOKENS_VERIFIER = 4_000;

// ─── Plans ─────────────────────────────────────────────────
export const PLAN_PAGES: Record<string, number> = {
  free: 10,
  basic: 600,
  pro: 3000,
  premium: 10000,
};

// ─── External API Timeouts (ms) ────────────────────────────
export const SOCRATA_TIMEOUT_MS = 30_000;
export const AZURE_OCR_TIMEOUT_MS = 300_000;
export const LINKEDIN_TIMEOUT_MS = 15_000;
export const MP_TIMEOUT_MS = 30_000;

// ─── doc2md Microservice ────────────────────────────────────
export const DOC2MD_SERVICE_URL =
  process.env.DOC2MD_SERVICE_URL ?? "http://localhost:8001";
