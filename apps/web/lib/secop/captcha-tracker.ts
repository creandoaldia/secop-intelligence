// ─────────────────────────────────────────────────────────────
// CaptchaTracker — Usage tracking, cost monitoring, and circuit
// breaker for 2captcha integration.
//
// PERSISTS TO: activity_log table (via db) — action="captcha.solve"
// JSONL removed per JD: dual-write sin transaccion es peligroso.
// loadHistory() restaura estado del circuit breaker al iniciar.
//
// Circuit breaker:
//   - Primary guard: cumulative cost cap (default $2.50 of $3.00)
//   - Secondary guard: failure rate >80% in last N attempts (default 20)
//   - Cooldown: auto-resets after 5 min of no activity
//
// Cost estimates (hardcoded, ±20% margin):
//   - ReCaptcha v2: ~$0.001/solve
//   - Image captcha: ~$0.0005/solve
//   2captcha does not expose per-solve cost in API responses.
// ─────────────────────────────────────────────────────────────

import crypto from "crypto";
import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

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

const COST_PER_1000_RECAPTCHA = 1.0;
const COST_PER_1000_IMAGE = 0.5;
const TOTAL_BUDGET_USD = 3.0;
const COST_CAP_USD = 2.50;
const DEFAULT_WINDOW_SIZE = 20;
const FAILURE_RATE_THRESHOLD = 0.8;
const COOLDOWN_MS = 5 * 60 * 1000;

// ─── Tracker ────────────────────────────────────────────────

export class CaptchaTracker {
  private records: CaptchaRecord[] = [];
  private windowSize: number;
  private lastCircuitTripAt: number | null = null;
  private loaded = false;

  constructor(windowSize: number = DEFAULT_WINDOW_SIZE) {
    this.windowSize = windowSize;
  }

  /**
   * Load historical records from activity_log to restore
   * circuit breaker state across restarts.
   */
  async loadHistory(): Promise<void> {
    if (this.loaded) return;
    try {
      const rows = await db
        .select()
        .from(activityLog)
        .where(
          and(
            eq(activityLog.action, "captcha.solve"),
            sql`${activityLog.createdAt} > strftime('%s','now','-30 days')`
          )
        )
        .orderBy(sql`${activityLog.createdAt} DESC`)
        .limit(500)
        .all();

      for (const row of rows) {
        if (!row.metadata) continue;
        try {
          const m = JSON.parse(row.metadata);
          this.records.push({
            id: row.entityId ?? crypto.randomUUID(),
            timestamp: new Date((row.createdAt as number) * 1000).toISOString(),
            type: m.type ?? "recaptcha_v2",
            durationMs: m.durationMs ?? 0,
            solved: m.solved ?? false,
            captchaCheckOk: m.captchaCheckOk ?? null,
            loginOk: m.loginOk ?? null,
            costUsd: m.costUsd ?? 0,
            attempt: m.attempt ?? 0,
            error: m.error,
          });
        } catch { /* skip malformed JSON */ }
      }
      this.loaded = true;
      console.log(`[CaptchaTracker] Loaded ${this.records.length} historical records`);
    } catch (err) {
      console.warn("[CaptchaTracker] Could not load history:", err);
    }
  }

  // ─── Record lifecycle ────────────────────────────────────

  startAttempt(type: CaptchaType, attempt: number = 0): string {
    const id = crypto.randomUUID();
    this.records.push({
      id, timestamp: new Date().toISOString(), type,
      durationMs: 0, solved: false,
      captchaCheckOk: null, loginOk: null,
      costUsd: 0, attempt,
    });
    return id;
  }

  reportSolve(id: string, solved: boolean, durationMs: number, error?: string): void {
    const r = this.findRecord(id);
    if (!r) return;
    r.solved = solved; r.durationMs = durationMs; r.error = error;
    r.costUsd = this.estimateCost(r.type);
  }

  reportCaptchaCheck(id: string, ok: boolean): void {
    const r = this.findRecord(id);
    if (!r) return;
    r.captchaCheckOk = ok;
    if (!ok) r.error = "CaptchaCheck failed";
  }

  reportLogin(id: string, ok: boolean): void {
    const r = this.findRecord(id);
    if (!r) return;
    r.loginOk = ok;
    if (!ok) r.error = (r.error ? r.error + "; " : "") + "Login failed";
  }

  /** Persist ONE record to DB via activity_log. */
  async persistRecord(id: string): Promise<void> {
    const r = this.findRecord(id);
    if (!r) return;
    try {
      await db.insert(activityLog).values({
        action: "captcha.solve",
        entity: "captcha",
        entityId: r.id,
        metadata: JSON.stringify({
          type: r.type, durationMs: r.durationMs,
          solved: r.solved, captchaCheckOk: r.captchaCheckOk,
          loginOk: r.loginOk, costUsd: r.costUsd,
          attempt: r.attempt, error: r.error,
        }),
      });
    } catch (err) {
      console.error("[CaptchaTracker] DB insert failed:", err);
    }
  }

  /** Persist ALL pending records (batch — single inserts per login flow). */
  async persistBatch(): Promise<void> {
    for (const r of this.records) {
      try {
        await db.insert(activityLog).values({
          action: "captcha.solve",
          entity: "captcha",
          entityId: r.id,
          metadata: JSON.stringify({
            type: r.type, durationMs: r.durationMs,
            solved: r.solved, captchaCheckOk: r.captchaCheckOk,
            loginOk: r.loginOk, costUsd: r.costUsd,
            attempt: r.attempt, error: r.error,
          }),
        });
      } catch (err) {
        console.error("[CaptchaTracker] DB insert failed:", err);
      }
    }
  }

  // ─── Circuit breaker ─────────────────────────────────────

  isCircuitBroken(): { broken: boolean; reason: string | null } {
    const stats = this.computeStats();
    if (this.lastCircuitTripAt) {
      if (Date.now() - this.lastCircuitTripAt > COOLDOWN_MS) {
        this.lastCircuitTripAt = null;
        return { broken: false, reason: null };
      }
    }
    if (stats.totalCostUsd >= COST_CAP_USD) {
      if (!this.lastCircuitTripAt) this.lastCircuitTripAt = Date.now();
      return { broken: true, reason: `Costo $${stats.totalCostUsd.toFixed(3)} supero $${COST_CAP_USD}` };
    }
    if (stats.recentFailRate > FAILURE_RATE_THRESHOLD && stats.totalAttempts >= this.windowSize) {
      if (!this.lastCircuitTripAt) this.lastCircuitTripAt = Date.now();
      return { broken: true, reason: `Fallo reciente ${(stats.recentFailRate*100).toFixed(0)}% > ${FAILURE_RATE_THRESHOLD*100}%` };
    }
    return { broken: false, reason: null };
  }

  // ─── Stats ────────────────────────────────────────────────

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

  getSummary(): string {
    const s = this.getStats();
    return [
      "╔══════════════════════════════════════╗",
      "║      Captcha Usage Report            ║",
      "╠══════════════════════════════════════╣",
      `║ Total intentos:      ${String(s.totalAttempts).padStart(5)}      ║`,
      `║ Tasa resolucion:     ${(s.solveSuccessRate*100).toFixed(1)}%               ║`,
      `║ Tasa flujo completo: ${(s.fullSuccessRate*100).toFixed(1)}%               ║`,
      `║ Costo total:         $${s.totalCostUsd.toFixed(3).padStart(5)}          ║`,
      `║ Presupuesto restante: $${s.costBudgetLeftUsd.toFixed(3).padStart(5)}          ║`,
      `║ Tasa fallo reciente: ${(s.recentFailRate*100).toFixed(1)}%               ║`,
      s.circuitBroken
        ? `║ ⚠ CIRCUIT BREAKER: ${(s.circuitBrokenReason ?? "").padEnd(20)} ║`
        : "║ Circuit breaker:    OFF               ║",
      "╚══════════════════════════════════════╝",
    ].join("\n");
  }

  // ─── Private ──────────────────────────────────────────────

  private findRecord(id: string): CaptchaRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  private estimateCost(type: CaptchaType): number {
    return type === "recaptcha_v2" ? COST_PER_1000_RECAPTCHA / 1000 : COST_PER_1000_IMAGE / 1000;
  }

  private computeStats() {
    const total = this.records.length;
    const solved = this.records.filter((r) => r.solved).length;
    const fullSuccess = this.records.filter((r) => r.solved && r.captchaCheckOk === true && r.loginOk === true).length;
    const totalCost = this.records.reduce((sum, r) => sum + r.costUsd, 0);
    const recent = this.records.slice(-this.windowSize);
    const recentFailed = recent.filter((r) => !r.solved).length;
    return {
      totalAttempts: total,
      solveSuccessRate: total > 0 ? solved / total : 1,
      fullSuccessRate: total > 0 ? fullSuccess / total : 1,
      totalCostUsd: totalCost,
      recentFailRate: recent.length > 0 ? recentFailed / recent.length : 0,
    };
  }
}
