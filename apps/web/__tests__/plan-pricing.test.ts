// ─────────────────────────────────────────────────────────────
// Tests: PLAN_PRICING Constants
// Pure data validation
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { PLAN_PRICING } from "@/lib/mercadopago/types";
import { PLAN_PAGES } from "@/lib/constants";

describe("PLAN_PRICING", () => {
  it("tiene los 3 planes pagos", () => {
    expect(Object.keys(PLAN_PRICING)).toEqual(["basic", "pro", "premium"]);
  });

  it("precios son consistentes: basic < pro < premium", () => {
    expect(PLAN_PRICING.basic.price).toBeLessThan(PLAN_PRICING.pro.price);
    expect(PLAN_PRICING.pro.price).toBeLessThan(PLAN_PRICING.premium.price);
  });

  it("paginas por mes son consistentes", () => {
    expect(PLAN_PRICING.basic.pagesPerMonth).toBeLessThan(PLAN_PRICING.pro.pagesPerMonth);
    expect(PLAN_PRICING.pro.pagesPerMonth).toBeLessThan(PLAN_PRICING.premium.pagesPerMonth);
  });

  it("todos los planes usan COP", () => {
    for (const plan of Object.values(PLAN_PRICING)) {
      expect(plan.currency).toBe("COP");
    }
  });

  it("precios son multiplos de 1000 (precios psicologicos)", () => {
    for (const plan of Object.values(PLAN_PRICING)) {
      expect(plan.price % 1000).toBe(0);
    }
  });

  it("paginas por mes coinciden con PLAN_PAGES", () => {
    expect(PLAN_PRICING.basic.pagesPerMonth).toBe(PLAN_PAGES.basic);
    expect(PLAN_PRICING.pro.pagesPerMonth).toBe(PLAN_PAGES.pro);
    expect(PLAN_PRICING.premium.pagesPerMonth).toBe(PLAN_PAGES.premium);
  });
});

describe("PLAN_PAGES", () => {
  it("incluye free con 10 paginas", () => {
    expect(PLAN_PAGES.free).toBe(10);
  });

  it("tiene todos los planes", () => {
    expect(Object.keys(PLAN_PAGES)).toEqual(["free", "basic", "pro", "premium"]);
  });

  it("paginas incrementan con el plan", () => {
    const values = Object.values(PLAN_PAGES);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});
