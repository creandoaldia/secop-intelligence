import {
  SocrataProcessRow,
  SocrataErrorResponse,
  SocrataApiError,
  SocrataRateLimitError,
  SocrataTimeoutError,
  SocrataNetworkError,
  SocrataCircuitOpenError,
  SocrataClientConfig,
  SocrataPageOptions,
} from "./types";
import { db } from "@/lib/db";
import { sourceHealth } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  BREAKER_COOLDOWN_MS,
  BREAKER_MAX_FAILURES,
  BREAKER_RESET_SUCCESSES,
  PAGE_SIZE_SOCRATA,
  SOCRATA_TIMEOUT_MS,
} from "@/lib/constants";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException("Aborted", "AbortError"));
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class SocrataClient {
  private baseUrl: string;
  private datasetId: string;
  private appToken?: string;
  private delayMs: number;
  private jitterPct: number;
  private maxRetryAfterSeconds: number;
  private lastRequestStart: number = 0;
  private requestQueue: Promise<void> = Promise.resolve();
  private readonly source = "socrata";

  constructor(config: SocrataClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.datasetId = config.datasetId;
    this.appToken = config.appToken;
    this.delayMs = config.delayMs;
    this.jitterPct = config.jitterPct;
    this.maxRetryAfterSeconds = config.maxRetryAfterSeconds;
  }

  // ─── Public: fetch one page with full anti-blocking ─────

  async fetchPage(
    offset: number,
    limit: number,
    signal?: AbortSignal,
    options: SocrataPageOptions = {}
  ): Promise<SocrataProcessRow[]> {
    if (!await this.isHealthy()) {
      const health = await db.select().from(sourceHealth).where(eq(sourceHealth.source, this.source)).get();
      throw new SocrataCircuitOpenError(health?.cooldownUntil ?? new Date());
    }

    // Enforce max page size
    const cappedLimit = Math.min(limit, PAGE_SIZE_SOCRATA);
    const query = new URLSearchParams({
      "$limit": String(cappedLimit),
      "$offset": String(offset),
      "$order": options.order ?? ":id",
    });
    if (options.where) query.set("$where", options.where);
    const url = `${this.baseUrl}/${this.datasetId}.json?${query.toString()}`;

    // Serialize via queue (concurrency=1)
    return new Promise<SocrataProcessRow[]>((resolve, reject) => {
      const prev = this.requestQueue;
      this.requestQueue = prev.then(async () => {
        try {
          const result = await this.fetchWithRetry(url, signal);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async isHealthy(): Promise<boolean> {
    await db.insert(sourceHealth).values({ source: this.source }).onConflictDoNothing().run();
    const health = await db.select().from(sourceHealth).where(eq(sourceHealth.source, this.source)).get();
    return health?.status !== "down" || !health.cooldownUntil || health.cooldownUntil <= new Date();
  }

  async reportSuccess(): Promise<void> {
    await db.run(sql`
      INSERT INTO source_health (
        source, status, consecutive_failures, consecutive_successes, breaker_trip_count,
        last_success_at, created_at, updated_at
      ) VALUES (${this.source}, 'healthy', 0, 1, 0, unixepoch(), unixepoch(), unixepoch())
      ON CONFLICT(source) DO UPDATE SET
        status = 'healthy',
        consecutive_failures = 0,
        consecutive_successes = CASE
          WHEN source_health.consecutive_successes + 1 >= ${BREAKER_RESET_SUCCESSES} THEN 0
          ELSE source_health.consecutive_successes + 1
        END,
        breaker_trip_count = CASE
          WHEN source_health.consecutive_successes + 1 >= ${BREAKER_RESET_SUCCESSES} THEN 0
          ELSE source_health.breaker_trip_count
        END,
        cooldown_until = NULL,
        last_success_at = unixepoch(),
        updated_at = unixepoch()
    `);
  }

  async reportFailure(error: SocrataApiError): Promise<void> {
    if (error.statusCode < 500 || error.statusCode >= 600) return;

    await db.run(sql`
      INSERT INTO source_health (
        source, status, consecutive_failures, consecutive_successes, breaker_trip_count,
        last_failure_at, last_error_message, created_at, updated_at
      ) VALUES (${this.source}, 'degraded', 1, 0, 0, unixepoch(), ${error.message}, unixepoch(), unixepoch())
      ON CONFLICT(source) DO UPDATE SET
        status = CASE
          WHEN source_health.consecutive_failures + 1 >= ${BREAKER_MAX_FAILURES} THEN 'down'
          ELSE 'degraded'
        END,
        consecutive_failures = source_health.consecutive_failures + 1,
        consecutive_successes = 0,
        breaker_trip_count = CASE
          WHEN source_health.consecutive_failures < ${BREAKER_MAX_FAILURES}
            AND source_health.consecutive_failures + 1 >= ${BREAKER_MAX_FAILURES}
          THEN source_health.breaker_trip_count + 1
          ELSE source_health.breaker_trip_count
        END,
        cooldown_until = CASE
          WHEN source_health.consecutive_failures < ${BREAKER_MAX_FAILURES}
            AND source_health.consecutive_failures + 1 >= ${BREAKER_MAX_FAILURES}
          THEN unixepoch() + CASE source_health.breaker_trip_count + 1
            WHEN 1 THEN ${BREAKER_COOLDOWN_MS[0] / 1000}
            WHEN 2 THEN ${BREAKER_COOLDOWN_MS[1] / 1000}
            WHEN 3 THEN ${BREAKER_COOLDOWN_MS[2] / 1000}
            ELSE ${BREAKER_COOLDOWN_MS[3] / 1000}
          END
          ELSE source_health.cooldown_until
        END,
        last_failure_at = unixepoch(),
        last_error_message = ${error.message},
        updated_at = unixepoch()
    `);
  }

  // ─── Internal: rate-limited fetch with retry ────────────

  private async fetchWithRetry(
    url: string,
    signal?: AbortSignal,
    retryCount: number = 0,
    retryHistory: number[] = []
  ): Promise<SocrataProcessRow[]> {
    // Rate limiter: delay + jitter (start-to-start)
    await this.waitForRateLimit(signal);

    // Set start time BEFORE fetch
    this.lastRequestStart = Date.now();

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SOCRATA_TIMEOUT_MS);

      // Combine external signal with timeout
      if (signal) {
        signal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      response = await fetch(url, {
        headers: {
          "User-Agent": "SECOP-Intelligence-Hub/1.0",
          ...(this.appToken ? { "X-App-Token": this.appToken } : {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new SocrataTimeoutError(
          `Request timed out after ${SOCRATA_TIMEOUT_MS}ms`,
          SOCRATA_TIMEOUT_MS
        );
      }
      throw new SocrataNetworkError(
        `Network error: ${(err as Error).message}`,
        err as Error
      );
    }

    // Handle non-OK status
    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = this.parseRetryAfter(response.headers);

        if (retryAfter > 0 && retryAfter <= this.maxRetryAfterSeconds) {
          // Wait according to Retry-After
          if (retryCount < 5) {
            retryHistory.push(retryAfter * 1000);
            await sleepWithSignal(retryAfter * 1000, signal);
            return this.fetchWithRetry(url, signal, retryCount + 1, retryHistory);
          }
        }

        // Fallback to exponential backoff
        const backoff = this.computeBackoff(retryCount);
        if (retryCount < 5) {
          retryHistory.push(backoff);
          await sleepWithSignal(backoff, signal);
          return this.fetchWithRetry(url, signal, retryCount + 1, retryHistory);
        }

        // Max retries exhausted
        throw new SocrataRateLimitError(
          `Rate limited after ${retryCount + 1} attempts. Total wait: ${retryHistory.reduce((a, b) => a + b, 0)}ms`,
          429,
          0,
          retryCount + 1,
          retryHistory
        );
      }

      // Non-429 errors: fail immediately (no retry)
      let body: string | undefined;
      try { body = await response.text(); } catch { /* ignore */ }
      const error = new SocrataApiError(
        `Socrata API error: ${response.status} ${response.statusText}`,
        response.status,
        body
      );
      await this.reportFailure(error);
      throw error;
    }

    // Success
    return response.json() as Promise<SocrataProcessRow[]>;
  }

  // ─── Rate limiter: delay + jitter ───────────────────────

  private async waitForRateLimit(signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestStart;

    // Calculate jitter
    const jitter = this.delayMs * this.jitterPct * (Math.random() * 2 - 1);
    const waitTime = Math.max(0, this.delayMs + jitter - elapsed);

    if (waitTime > 0) {
      await sleepWithSignal(waitTime, signal);
    }
  }

  // ─── Backoff computation ─────────────────────────────────

  private computeBackoff(attempt: number): number {
    const backoffSeconds = Math.min(Math.pow(2, attempt), 16); // cap at 16s
    return backoffSeconds * 1000;
  }

  // ─── Parse Retry-After header ────────────────────────────

  private parseRetryAfter(headers: Headers): number {
    const val = headers.get("Retry-After");
    if (!val) return 0;
    const seconds = parseInt(val, 10);
    return isNaN(seconds) ? 0 : seconds;
  }
}
