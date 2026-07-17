// ─────────────────────────────────────────────────────────────
// CaptchaTracker — Usage tracking, cost monitoring, and circuit
// breaker for 2captcha integration.
//
// Tracker wraps the CaptchaSolver externally (not injected into
// solveIfPresent). Used from auth.ts to record every step:
//   solve → CaptchaCheck → login
//
// Circuit breaker:
//   - Primary guard: cumulative cost cap (default $2.50 of $3.00)
//   - Secondary guard: failure rate >80% in last N attempts (default 20)
//   - Cooldown: auto-resets after 5 min of no activity
//
// Cost estimates (hardcoded, ±20% margin):
//   - ReCaptcha v2: $0.001/solve ($1.00/1000)
//   - Image captcha: $0.0005/solve ($0.50/1000)
//   2captcha does not expose per-solve cost in API responses.
// ─────────────────────────────────────────────────────────────

import { mkdirSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────

export type CaptchaType = "recaptcha_v2" | "image";

export interface CaptchaRecord {
  id: string;
  timestamp: string;
  type: CaptchaType;
  durationMs: number;
  solved: boolean;
  captchaCheckOk: boolean | null;
  loginOk: boolean | null;
  costUsd: number;
  attempt: number;
  error?: string;
}

export interface CaptchaStats {
  totalAttempts: number;
  solveSuccessRate: number;
  fullSuccessRate: number;
  totalCostUsd: number;
  costBudgetLeftUsd: number;
  recentFailRate: number;
  circuitBroken: boolean;
  circuitBrokenReason: string | null;
}

// ─── Constants ──────────────────────────────────────────────

// Cost per 1000 solves from 2captcha pricing (July 2026)
// ±20% margin due to variable pricing
const COST_PER_1000_RECAPTCHA = 1.0;  // $1.00/1000 reCAPTCHA v2
const COST_PER_1000_IMAGE = 0.5;      // $0.50/1000 image captcha

// Budget
const TOTAL_BUDGET_USD = 3.0;          // $3 loaded in 2captcha account
const COST_CAP_USD = 2.50;             // Stop at $2.50 to leave margin

// Circuit breaker
const DEFAULT_WINDOW_SIZE = 20;         // Last N attempts for failure rate
const FAILURE_RATE_THRESHOLD = 0.8;     // >80% failure trips breaker
const COOLDOWN_MS = 5 * 60 * 1000;      // 5 min auto-reset

// ─── Tracker ────────────────────────────────────────────────

export class CaptchaTracker {
  private records: CaptchaRecord[] = [];
  private filePath: string;
  private windowSize: number;
  private lastCircuitTripAt: number | null = null;
  private flushed = false;

  constructor(
    filePath?: string,
    windowSize: number = DEFAULT_WINDOW_SIZE
  ) {
    this.filePath = filePath ?? join(process.cwd(), "data", "captcha-usage.jsonl");
    this.windowSize = windowSize;
    this.ensureDir();
  }

  // ─── Record lifecycle ────────────────────────────────────

  /** Start a new captcha solve attempt. Returns record ID. */
  startAttempt(type: CaptchaType, attempt: number = 0): string {
    const id = crypto.randomUUID();
    this.records.push({
      id,
      timestamp: new Date().toISOString(),
      type,
      durationMs: 0,
      solved: false,
      captchaCheckOk: null,
      loginOk: null,
      costUsd: 0,
      attempt,
    });
    return id;
  }

  /** Report 2captcha solve result. */
  reportSolve(id: string, solved: boolean, durationMs: number, error?: string): void {
    const record = this.findRecord(id);
    if (!record) return;
    record.solved = solved;
    record.durationMs = durationMs;
    record.error = error;
    // Estimate cost based on type
    record.costUsd = this.estimateCost(record.type);
  }

  /** Report CaptchaCheck endpoint result. */
  reportCaptchaCheck(id: string, ok: boolean): void {
    const record = this.findRecord(id);
    if (!record) return;
    record.captchaCheckOk = ok;
    if (!ok) record.error = "CaptchaCheck failed";
  }

  /** Report login result. */
  reportLogin(id: string, ok: boolean): void {
    const record = this.findRecord(id);
    if (!record) return;
    record.loginOk = ok;
    if (!ok) record.error = (record.error ? record.error + "; " : "") + "Login failed";
  }

  /** Persist a single record to disk (append JSON line). */
  flushRecord(id: string): void {
    const record = this.findRecord(id);
    if (!record) return;
    try {
      appendFileSync(this.filePath, JSON.stringify(record) + "\n", "utf-8");
    } catch (err) {
      console.error("[CaptchaTracker] Failed to write log:", err);
    }
  }

  /** Persist all pending records. */
  flush(): void {
    for (const record of this.records) {
      if (!this.wasFlushed(record)) {
        try {
          appendFileSync(this.filePath, JSON.stringify(record) + "\n", "utf-8");
        } catch (err) {
          console.error("[CaptchaTracker] Failed to write log:", err);
        }
      }
    }
    this.flushed = true;
  }

  // ─── Circuit breaker ─────────────────────────────────────

  /**
   * Check if the circuit is broken.
   * Circuit opens when:
   *   1. Cumulative cost exceeds COST_CAP_USD (primary guard), OR
   *   2. Recent failure rate > FAILURE_RATE_THRESHOLD (secondary guard)
   * Circuit auto-closes after COOLDOWN_MS of no activity.
   */
  isCircuitBroken(): { broken: boolean; reason: string | null } {
    const stats = this.computeStats();

    // Auto-reset after cooldown
    if (this.lastCircuitTripAt) {
      const elapsed = Date.now() - this.lastCircuitTripAt;
      if (elapsed > COOLDOWN_MS) {
        this.lastCircuitTripAt = null;
        console.log("[CaptchaTracker] Circuit breaker auto-reset after cooldown");
        return { broken: false, reason: null };
      }
    }

    // Primary guard: cost cap
    if (stats.totalCostUsd >= COST_CAP_USD) {
      if (!this.lastCircuitTripAt) this.lastCircuitTripAt = Date.now();
      return {
        broken: true,
        reason: `Costo acumulado $${stats.totalCostUsd.toFixed(3)} supero el limite de $${COST_CAP_USD}`,
      };
    }

    // Secondary guard: failure rate
    if (stats.recentFailRate > FAILURE_RATE_THRESHOLD && stats.totalAttempts >= this.windowSize) {
      if (!this.lastCircuitTripAt) this.lastCircuitTripAt = Date.now();
      return {
        broken: true,
        reason: `Tasa de fallo reciente ${(stats.recentFailRate * 100).toFixed(0)}% supera el limite ${FAILURE_RATE_THRESHOLD * 100}%`,
      };
    }

    return { broken: false, reason: null };
  }

  // ─── Stats ────────────────────────────────────────────────

  /** Get current statistics. */
  getStats(): CaptchaStats {
    const s = this.computeStats();
    const cb = this.isCircuitBroken();
    return {
      totalAttempts: s.totalAttempts,
      solveSuccessRate: s.solveSuccessRate,
      fullSuccessRate: s.fullSuccessRate,
      totalCostUsd: s.totalCostUsd,
      costBudgetLeftUsd: Math.max(0, TOTAL_BUDGET_USD - s.totalCostUsd),
      recentFailRate: s.recentFailRate,
      circuitBroken: cb.broken,
      circuitBrokenReason: cb.reason,
    };
  }

  /** Human-readable summary. */
  getSummary(): string {
    const s = this.getStats();
    const lines = [
      "╔══════════════════════════════════════╗",
      "║      Captcha Usage Report            ║",
      "╠══════════════════════════════════════╣",
      `║ Total intentos:      ${String(s.totalAttempts).padStart(5)}      ║`,
      `║ Tasa resolucion:     ${(s.solveSuccessRate * 100).toFixed(1)}%               ║`,
      `║ Tasa flujo completo: ${(s.fullSuccessRate * 100).toFixed(1)}%               ║`,
      `║ Costo total:         $${s.totalCostUsd.toFixed(3).padStart(5)}          ║`,
      `║ Presupuesto restante: $${s.costBudgetLeftUsd.toFixed(3).padStart(5)}          ║`,
      `║ Tasa fallo reciente: ${(s.recentFailRate * 100).toFixed(1)}%               ║`,
      s.circuitBroken
        ? `║ ⚠ CIRCUIT BREAKER: ${s.circuitBrokenReason?.padEnd(20)} ║`
        : `║ Circuit breaker:    OFF               ║`,
      "╚══════════════════════════════════════╝",
    ];
    return lines.join("\n");
  }

  // ─── Private ──────────────────────────────────────────────

  private findRecord(id: string): CaptchaRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  private wasFlushed(record: CaptchaRecord): boolean {
    return this.flushed && this.records.indexOf(record) >= 0;
  }

  private estimateCost(type: CaptchaType): number {
    if (type === "recaptcha_v2") {
      return COST_PER_1000_RECAPTCHA / 1000;
    }
    return COST_PER_1000_IMAGE / 1000;
  }

  private computeStats() {
    const total = this.records.length;
    const solved = this.records.filter((r) => r.solved).length;
    const fullSuccess = this.records.filter(
      (r) => r.solved && r.captchaCheckOk === true && r.loginOk === true
    ).length;
    const totalCost = this.records.reduce((sum, r) => sum + r.costUsd, 0);

    // Recent window for failure rate
    const recent = this.records.slice(-this.windowSize);
    const recentFailed = recent.filter((r) => !r.solved).length;
    const recentFailRate = recent.length > 0 ? recentFailed / recent.length : 0;

    return {
      totalAttempts: total,
      solveSuccessRate: total > 0 ? solved / total : 1,
      fullSuccessRate: total > 0 ? fullSuccess / total : 1,
      totalCostUsd: totalCost,
      recentFailRate,
    };
  }

  private ensureDir(): void {
    const dir = this.filePath.includes("\\")
      ? this.filePath.substring(0, this.filePath.lastIndexOf("\\"))
      : this.filePath.includes("/")
        ? this.filePath.substring(0, this.filePath.lastIndexOf("/"))
        : process.cwd();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
