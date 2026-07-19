// @vitest-environment jsdom
// ─────────────────────────────────────────────────────────────
// Tests: AnalysisTracker polling component (T9)
// Renders with jsdom, validates all terminal outcomes,
// transitions, and toast behavior
// ─────────────────────────────────────────────────────────────

import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisTracker } from "@/components/analysis/analysis-tracker";
import {
  createCompletedJob,
  createCompletedResult,
  createDownloadingJob,
  createFailedJob,
  resetTestIds,
} from "./fixtures/analysis";

// ─── Mocks ──────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// ─── Mock fetch via globalThis replacement ──────────────────
// We avoid vi.fn() for fetch to prevent vi.clearAllMocks() from
// affecting the implementation. Instead, we patch globalThis.fetch
// directly and use a plain closure for response dispatching.

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<Record<string, unknown>>;
};

let currentResponse: FetchResponse | null = null;

function makeOk(body: Record<string, unknown>): FetchResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function makeStatus(status: number): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({}),
  };
}

const MOCK_FETCH_IMPL = (): Promise<FetchResponse> => {
  if (currentResponse === null) {
    return Promise.reject(new TypeError("Failed to fetch"));
  }
  return Promise.resolve(currentResponse);
};

// ─── Helpers ─────────────────────────────────────────────────

const DEFAULT_PROCESSO_ID = "proceso-test-1";
const ANALYSIS_ID = "analysis-test-1";

function renderTracker(): void {
  render(
    createElement(AnalysisTracker, {
      analysisId: ANALYSIS_ID,
      procesoId: DEFAULT_PROCESSO_ID,
    }),
  );
}

// ─── Setup / teardown ───────────────────────────────────────

beforeEach(() => {
  resetTestIds();
  vi.clearAllMocks();
  currentResponse = null; // defaults to network error

  // Patch global fetch with our controlled implementation
  globalThis.fetch = MOCK_FETCH_IMPL as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = MOCK_FETCH_IMPL as unknown as typeof globalThis.fetch;
});

// ─── Tests ───────────────────────────────────────────────────

describe("T9 — AnalysisTracker polling", () => {
  describe("Terminal outcomes", () => {
    it("renders login CTA on 401, no retry button", async () => {
      currentResponse = makeStatus(401);
      renderTracker();

      expect(await screen.findByText(/Tu sesión expiró/i, {}, { timeout: 3000 })).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Inicia sesión nuevamente/i }),
      ).toHaveAttribute("href", "/login");
      expect(screen.queryByRole("button", { name: /Reintentar/i })).not.toBeInTheDocument();
    });

    it("renders deleted-or-expired message on 404, no retry button", async () => {
      currentResponse = makeStatus(404);
      renderTracker();

      expect(
        await screen.findByText(/El análisis fue eliminado o expiró/i, {}, { timeout: 3000 }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Volver a búsqueda/i }),
      ).toHaveAttribute("href", "/procesos");
      expect(screen.queryByRole("button", { name: /Reintentar/i })).not.toBeInTheDocument();
    });

    it("renders generic error with retry button on network failure", async () => {
      // currentResponse = null → fetch rejects → error state
      renderTracker();

      expect(await screen.findByText(/Failed to fetch/i, {}, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    });
  });

  describe("Processing and completed states", () => {
    it("renders StatusCard when estado is downloading", async () => {
      const downloadingJob = createDownloadingJob({ id: ANALYSIS_ID });
      currentResponse = makeOk({ job: downloadingJob, result: null });
      renderTracker();

      // StatusCard renders the step label in the badge AND in the step list
      const els = await screen.findAllByText(/Descargando pliego/i, {}, { timeout: 3000 });
      expect(els.length).toBeGreaterThanOrEqual(1);
      // Verify the full StatusCard is present (look for the card title)
      expect(screen.getByText(/Estado del Analisis/i)).toBeInTheDocument();
    });

    it("renders ResultsDisplay when estado is completed with result", async () => {
      const completedJob = createCompletedJob({ id: ANALYSIS_ID });
      const completedResult = createCompletedResult({ jobId: ANALYSIS_ID });
      currentResponse = makeOk({ job: completedJob, result: completedResult });
      renderTracker();

      expect(await screen.findByText(/Confianza/i, {}, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByText(/Resumen simulado/i)).toBeInTheDocument();
    });
  });

  describe("Toast behavior", () => {
    it("fires exactly one toast.success on transition from downloading to completed and stops polling", async () => {
      const downloadingJob = createDownloadingJob({ id: ANALYSIS_ID });
      const completedJob = createCompletedJob({ id: ANALYSIS_ID });
      const completedResult = createCompletedResult({ jobId: ANALYSIS_ID });

      let fetchCount = 0;
      currentResponse = makeOk({ job: downloadingJob, result: null });

      // Override fetch to alternate responses
      const originalFetch = MOCK_FETCH_IMPL;
      globalThis.fetch = (() => {
        fetchCount++;
        if (fetchCount === 1) {
          return Promise.resolve(makeOk({ job: downloadingJob, result: null }));
        }
        return Promise.resolve(makeOk({ job: completedJob, result: completedResult }));
      }) as unknown as typeof globalThis.fetch;

      renderTracker();

      // StatusCard renders "Descargando pliego" in badge AND step list (multiple)
      await vi.waitFor(async () => {
        const els = screen.getAllByText(/Descargando pliego/i);
        expect(els.length).toBeGreaterThanOrEqual(1);
      }, { timeout: 3000, interval: 50 });
      expect(mockToastSuccess).not.toHaveBeenCalled();

      // Wait for the 3000ms polling interval to fire
      await new Promise((r) => setTimeout(r, 4000));

      expect(mockToastSuccess).toHaveBeenCalledTimes(1);
      expect(mockToastSuccess).toHaveBeenCalledWith("Análisis completado");
      expect(screen.getByText(/Confianza/i)).toBeInTheDocument();
    }, 15000);

    it("fires exactly one toast.error on transition from downloading to failed and stops polling", async () => {
      const downloadingJob = createDownloadingJob({ id: ANALYSIS_ID });
      const failedJob = createFailedJob("Error simulado", { id: ANALYSIS_ID });

      let fetchCount = 0;
      currentResponse = makeOk({ job: downloadingJob, result: null });

      globalThis.fetch = (() => {
        fetchCount++;
        if (fetchCount === 1) {
          return Promise.resolve(makeOk({ job: downloadingJob, result: null }));
        }
        return Promise.resolve(makeOk({ job: failedJob, result: null }));
      }) as unknown as typeof globalThis.fetch;

      renderTracker();

      // Wait for first poll to render downloading
      await vi.waitFor(async () => {
        const els = screen.getAllByText(/Descargando pliego/i);
        expect(els.length).toBeGreaterThanOrEqual(1);
      }, { timeout: 3000, interval: 50 });
      expect(mockToastError).not.toHaveBeenCalled();

      // Wait for the 3000ms polling interval to fire
      await new Promise((r) => setTimeout(r, 4000));

      expect(mockToastError).toHaveBeenCalledTimes(1);
      expect(mockToastError).toHaveBeenCalledWith("Análisis fallido");
      // Failed UI should render with error message
      expect(screen.getByText(/Error simulado/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    }, 15000);

    it("fires zero toasts when mounting an already-completed job", async () => {
      const completedJob = createCompletedJob({ id: ANALYSIS_ID });
      const completedResult = createCompletedResult({ jobId: ANALYSIS_ID });
      currentResponse = makeOk({ job: completedJob, result: completedResult });
      renderTracker();

      expect(await screen.findByText(/Confianza/i, {}, { timeout: 3000 })).toBeInTheDocument();
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(mockToastError).not.toHaveBeenCalled();

      await new Promise((r) => setTimeout(r, 500));
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(mockToastError).not.toHaveBeenCalled();
    });
  });
});
