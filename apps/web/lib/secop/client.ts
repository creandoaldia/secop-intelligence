import {
  SocrataProcessRow,
  SocrataErrorResponse,
  SocrataApiError,
  SocrataRateLimitError,
  SocrataTimeoutError,
  SocrataNetworkError,
  SocrataClientConfig,
} from "./types";
import { SOCRATA_TIMEOUT_MS, PAGE_SIZE_SOCRATA, SOCRATA_MAX_CONCURRENCY } from "@/lib/constants";

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
    signal?: AbortSignal
  ): Promise<SocrataProcessRow[]> {
    // Enforce max page size
    const cappedLimit = Math.min(limit, PAGE_SIZE_SOCRATA);

    const url = `${this.baseUrl}/${this.datasetId}.json?$limit=${cappedLimit}&$offset=${offset}&$order=:id`;

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
      throw new SocrataApiError(
        `Socrata API error: ${response.status} ${response.statusText}`,
        response.status,
        body
      );
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
