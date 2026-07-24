// @vitest-environment jsdom
// ─────────────────────────────────────────────────────────────
// Tests: PricingHistoryChart component
// Scenarios:
//   S8 — chart renders with data points
//   S9 — empty state when no history
//   S10 — error fallback on query failure
//   S11 — loading skeleton (handled by parent Suspense)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PricingHistoryChart } from "../procesos/pricing-history-chart";

describe("PricingHistoryChart", () => {
  it('S9: renders empty state when data is empty', () => {
    render(<PricingHistoryChart data={[]} />);
    expect(screen.getByText("No hay historial de precios aún")).toBeInTheDocument();
  });

  it('S10: renders error state when error is provided', () => {
    render(<PricingHistoryChart data={[]} error="Error al cargar historial de precios" />);
    const errorEl = screen.getByText("Error al cargar historial de precios");
    expect(errorEl).toBeInTheDocument();
    // Error should be styled as destructive
    expect(errorEl.tagName).toBe("P");
    expect(errorEl.className).toContain("destructive");
  });

  it("S8: renders chart card with data points — no empty/error state shown", () => {
    const data = [
      { observedAt: "2026-01-01T00:00:00.000Z", valor: 100000 },
      { observedAt: "2026-02-01T00:00:00.000Z", valor: 150000 },
      { observedAt: "2026-03-01T00:00:00.000Z", valor: 200000 },
    ];

    render(<PricingHistoryChart data={data} />);

    // Card title should always be present
    expect(screen.getByText("Historial de Precios")).toBeInTheDocument();

    // No empty-state or error messages shown
    expect(screen.queryByText("No hay historial de precios aún")).not.toBeInTheDocument();
    // Error takes precedence and shouldn't appear
    expect(screen.queryByText("Error al cargar historial de precios")).not.toBeInTheDocument();
  });

  it("renders error state when data is not empty but error is provided", () => {
    const data = [
      { observedAt: "2026-01-01T00:00:00.000Z", valor: 100000 },
    ];

    render(<PricingHistoryChart data={data} error="Error al cargar historial de precios" />);

    // Error takes precedence over data
    expect(screen.getByText("Error al cargar historial de precios")).toBeInTheDocument();
    expect(screen.queryByText("No hay historial de precios aún")).not.toBeInTheDocument();
  });
});
