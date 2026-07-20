// @vitest-environment jsdom
// ─────────────────────────────────────────────────────────────
// Tests: FreshnessBadge component (T6)
// Covers age thresholds, status override, null/future timestamps,
// label ordering, and tooltip with absolute date.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreshnessBadge } from "../freshness-badge";

/**
 * Fixed "now" timestamp: 2026-07-19T12:00:00Z in epoch milliseconds.
 * All relative offsets are computed from this anchor.
 */
const NOW_MS = 1_784_444_400_000;
const ONE_HOUR_MS = 3_600_000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** Convert an epoch-ms value to the Unix-seconds number the component expects. */
function unixSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

describe("FreshnessBadge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("color thresholds", () => {
    it("renders green for timestamps less than 24 hours old", () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW_MS);

      const twoHoursAgo = unixSeconds(NOW_MS - 2 * ONE_HOUR_MS);
      render(<FreshnessBadge timestamp={twoHoursAgo} />);

      const badge = screen.getByText("hace 2h");
      expect(badge).toHaveClass("text-green-600");
    });

    it("renders yellow for timestamps between 1 and 7 days old", () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW_MS);

      const threeDaysAgo = unixSeconds(NOW_MS - 3 * ONE_DAY_MS);
      render(<FreshnessBadge timestamp={threeDaysAgo} />);

      const badge = screen.getByText("hace 3d");
      expect(badge).toHaveClass("text-yellow-600");
    });

    it("renders red for timestamps 7 days or older", () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW_MS);

      const fifteenDaysAgo = unixSeconds(NOW_MS - 15 * ONE_DAY_MS);
      render(<FreshnessBadge timestamp={fifteenDaysAgo} />);

      const badge = screen.getByText("hace 15d");
      expect(badge).toHaveClass("text-red-600");
    });
  });

  it("for status='down' renders red regardless of age", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const twoHoursAgo = unixSeconds(NOW_MS - 2 * ONE_HOUR_MS);
    render(<FreshnessBadge timestamp={twoHoursAgo} status="down" />);

    const badge = screen.getByText("hace 2h");
    expect(badge).toHaveClass("text-red-600");
    expect(badge).not.toHaveClass("text-green-600");
  });

  it('shows "Sin datos" for null / undefined timestamps', () => {
    const { rerender } = render(<FreshnessBadge timestamp={null} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();

    rerender(<FreshnessBadge timestamp={undefined} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
  });

  it('shows "Sin datos" for future timestamps (clock-skew protection)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const future = unixSeconds(NOW_MS + ONE_HOUR_MS);
    render(<FreshnessBadge timestamp={future} />);

    expect(screen.getByText("Sin datos")).toBeInTheDocument();
  });

  it("renders label before the relative time value", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const twoHoursAgo = unixSeconds(NOW_MS - 2 * ONE_HOUR_MS);
    render(<FreshnessBadge timestamp={twoHoursAgo} label="Datos sincronizados:" />);

    const badge = screen.getByText(/Datos sincronizados:\s*hace 2h/);
    expect(badge).toBeInTheDocument();
  });

  it("includes absolute date in title and aria-label", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const twoHoursAgo = unixSeconds(NOW_MS - 2 * ONE_HOUR_MS);
    render(<FreshnessBadge timestamp={twoHoursAgo} />);

    const badge = screen.getByText("hace 2h");

    // title contains a 4-digit year (timezone-safe assertion)
    expect(badge).toHaveAttribute("title", expect.stringMatching(/\d{4}/));

    // aria-label includes "Última sincronización:" followed by date info
    expect(badge).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Última sincronización:"),
    );
  });
});
