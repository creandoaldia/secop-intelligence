// ─────────────────────────────────────────────────────────────
// Tests: Plan Gating — canUseFeature access matrix
// Pure function tests: no mocks, no DB, no network
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { canUseFeature } from "@/lib/features";

const PLANS = ["free", "basic", "pro", "premium"] as const;

// Expected matrix: feature -> allowed plans
const ACCESS_MATRIX: Record<string, string[]> = {
  analisis: ["basic", "pro", "premium"],
  linkedin: ["pro", "premium"],
  sena_ilimitado: ["pro", "premium"],
  exportar: ["basic", "pro", "premium"],
  alertas: ["basic", "pro", "premium"],
  pricing_history: ["free", "basic", "pro", "premium"],
};

describe("canUseFeature — plan gating access matrix", () => {
  // ── Feature: alertas ─────────────────────────────────────
  describe("alertas", () => {
    it("returns true for basic, pro, premium", () => {
      expect(canUseFeature("basic", "alertas")).toBe(true);
      expect(canUseFeature("pro", "alertas")).toBe(true);
      expect(canUseFeature("premium", "alertas")).toBe(true);
    });

    it("returns false for free", () => {
      expect(canUseFeature("free", "alertas")).toBe(false);
    });
  });

  // ── Feature: linkedin ────────────────────────────────────
  describe("linkedin", () => {
    it("returns true for pro, premium", () => {
      expect(canUseFeature("pro", "linkedin")).toBe(true);
      expect(canUseFeature("premium", "linkedin")).toBe(true);
    });

    it("returns false for free, basic", () => {
      expect(canUseFeature("free", "linkedin")).toBe(false);
      expect(canUseFeature("basic", "linkedin")).toBe(false);
    });
  });

  // ── Full matrix coverage ─────────────────────────────────
  it("every feature × every plan matches the defined access matrix", () => {
    for (const [feature, allowedPlans] of Object.entries(ACCESS_MATRIX)) {
      for (const plan of PLANS) {
        expect(canUseFeature(plan, feature as any)).toBe(
          allowedPlans.includes(plan)
        );
      }
    }
  });

  // ── Unknown feature ──────────────────────────────────────
  it("unknown feature key returns false for all plans", () => {
    for (const plan of PLANS) {
      expect(canUseFeature(plan, "unknown_feature" as any)).toBe(false);
    }
  });
});
