// ─────────────────────────────────────────────────────────────
// Tests: Constants consistency
// Validates that all imported constants exist and are coherent
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  ONE_MINUTE_MS,
  ONE_HOUR_MS,
  ONE_DAY_MS,
  THIRTY_DAYS_MS,
  SESSION_MAX_AGE_SECONDS,
  RL_STRICT,
  RL_MODERATE,
  RL_STANDARD,
  RL_GENEROUS,
  PAGE_SIZE_SOCRATA,
  SYNC_MAX_RETRIES,
  ANALYSIS_MAX_RETRIES,
  SOCRATA_TIMEOUT_MS,
} from "@/lib/constants";

describe("Time constants", () => {
  it("ONE_MINUTE_MS es 60 segundos", () => {
    expect(ONE_MINUTE_MS).toBe(60_000);
  });

  it("ONE_HOUR_MS es 60 minutos", () => {
    expect(ONE_HOUR_MS).toBe(3_600_000);
  });

  it("THIRTY_DAYS_MS es 30 dias", () => {
    expect(THIRTY_DAYS_MS).toBe(30 * ONE_DAY_MS);
  });

  it("SESSION_MAX_AGE_SECONDS es 30 dias en segundos", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });
});

describe("Rate limit presets", () => {
  it("RL_STRICT tiene pocos requests por hora", () => {
    expect(RL_STRICT.maxRequests).toBe(5);
    expect(RL_STRICT.windowMs).toBe(ONE_HOUR_MS);
  });

  it("RL_GENEROUS tiene mas requests que RL_STANDARD", () => {
    expect(RL_GENEROUS.maxRequests).toBeGreaterThan(RL_STANDARD.maxRequests);
  });

  it("todos los presets tienen windowMs positivo", () => {
    const presets = [RL_STRICT, RL_MODERATE, RL_STANDARD, RL_GENEROUS];
    for (const p of presets) {
      expect(p.windowMs).toBeGreaterThan(0);
      expect(p.maxRequests).toBeGreaterThan(0);
    }
  });
});

describe("Pagination constants", () => {
  it("PAGE_SIZE_SOCRATA es 1000 (maximo de la API)", () => {
    expect(PAGE_SIZE_SOCRATA).toBe(1000);
  });
});

describe("Retry constants", () => {
  it("SYNC_MAX_RETRIES matches Socrata client", () => {
    expect(SYNC_MAX_RETRIES).toBe(5);
  });

  it("ANALYSIS_MAX_RETRIES matches worker", () => {
    expect(ANALYSIS_MAX_RETRIES).toBe(3);
  });
});

describe("Timeout constants", () => {
  it("SOCRATA_TIMEOUT_MS es 30 segundos", () => {
    expect(SOCRATA_TIMEOUT_MS).toBe(30_000);
  });
});
