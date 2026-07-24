// @vitest-environment jsdom
// ─────────────────────────────────────────────────────────────
// Tests: PreciosHistoryChart + PreciosSummaryCards components
// Scenarios:
//   S15 — empty state when no data exists
//   Chart renders with data points
//   Summary cards render stats correctly
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreciosHistoryChart } from "../precios/precios-history-chart";
import { PreciosSummaryCards } from "../precios/precios-summary-cards";

describe("PreciosHistoryChart", () => {
  it("S15: renders empty state when data is empty", () => {
    render(<PreciosHistoryChart data={[]} />);
    expect(
      screen.getByText(/no hay datos de precios aún/i)
    ).toBeInTheDocument();
  });

  it("renders chart card when data is provided", () => {
    const data = [
      {
        procesoId: "1",
        procesoNombre: "Puente peatonal",
        entidadNombre: "Bogotá",
        valor: 500000,
        observedAt: "2026-01-15T00:00:00.000Z",
      },
      {
        procesoId: "2",
        procesoNombre: "Vía terciaria",
        entidadNombre: "Medellín",
        valor: 1200000,
        observedAt: "2026-02-20T00:00:00.000Z",
      },
    ];

    render(<PreciosHistoryChart data={data} />);

    // Card title should be present
    expect(screen.getByText("Evolución de Precios")).toBeInTheDocument();

    // Empty state should NOT be shown
    expect(
      screen.queryByText(/no hay datos de precios aún/i)
    ).not.toBeInTheDocument();
  });
});

describe("PreciosSummaryCards", () => {
  it("renders all four stat cards with formatted values", () => {
    const summary = { count: 42, average: 500000, min: 100000, max: 2000000 };

    render(<PreciosSummaryCards summary={summary} />);

    // Count
    expect(screen.getByText("42")).toBeInTheDocument();
    // Average (formatted COP)
    expect(screen.getByText("$ 500.000")).toBeInTheDocument();
    // Min
    expect(screen.getByText("$ 100.000")).toBeInTheDocument();
    // Max
    expect(screen.getByText("$ 2.000.000")).toBeInTheDocument();
  });

  it("renders dash for null values", () => {
    const summary = { count: 0, average: null, min: null, max: null };

    render(<PreciosSummaryCards summary={summary} />);

    // Count is 0
    expect(screen.getByText("0")).toBeInTheDocument();
    // All others show em-dash
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(3);
  });
});
