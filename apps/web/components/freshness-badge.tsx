"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Timestamp = Date | number | string | null | undefined;

interface FreshnessBadgeProps {
  /** Date (Drizzle ORM), Unix seconds number, ISO 8601 string, or null/undefined */
  timestamp: Timestamp;
  /** Optional prefix like "Datos sincronizados:" */
  label?: string;
  /** Source health status — "down" forces red regardless of age */
  status?: "healthy" | "degraded" | "down";
}

/**
 * Normalise a timestamp value to epoch milliseconds.
 * - `Date` → `.getTime()`
 * - `number` → treated as Unix seconds, multiplied by 1000
 * - `string` → ISO 8601, parsed via `new Date(ts).getTime()`
 * - `null` / `undefined` → null
 */
function toEpochMs(ts: Timestamp): number | null {
  if (ts == null) return null;
  if (typeof ts === "number" && Number.isNaN(ts)) return null;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "string") return new Date(ts).getTime();
  if (typeof ts === "number") return ts * 1000; // Unix seconds → ms
  return null;
}

interface AgeDisplay {
  text: string;
  color: string;
}

function computeAgeDisplay(ageMs: number, status?: "healthy" | "degraded" | "down"): AgeDisplay {
  const hours = Math.floor(ageMs / 3_600_000);
  const days = Math.floor(hours / 24);

  // "down" overrides colour to red regardless of age
  if (status === "down") {
    const text = hours < 24 ? `hace ${hours}h` : `hace ${days}d`;
    return { text, color: "text-red-600" };
  }

  if (hours < 24) return { text: `hace ${hours}h`, color: "text-green-600" };
  if (days < 7) return { text: `hace ${days}d`, color: "text-yellow-600" };
  return { text: `hace ${days}d`, color: "text-red-600" };
}

export function FreshnessBadge({ timestamp, label, status }: FreshnessBadgeProps) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  let epochMs = toEpochMs(timestamp);
  if (Number.isNaN(epochMs)) epochMs = null;

  // --- No-data branch (always safe to render, no hydration risk) ---
  if (epochMs == null) {
    return (
      <span className="text-sm text-muted-foreground">
        {label && <>{label} </>}
        Sin datos
      </span>
    );
  }

  // --- Server / initial client render: non-empty placeholder to avoid hydration flash ---
  if (!mounted) {
    return (
      <span className="text-sm text-muted-foreground">
        {label && <>{label} </>}
        —
      </span>
    );
  }

  // --- Future timestamp (clock-skew protection) ---
  if (epochMs > now) {
    return (
      <span className="text-sm text-muted-foreground">
        {label && <>{label} </>}
        Sin datos
      </span>
    );
  }

  // --- Relative time display ---
  const ageMs = now - epochMs;
  const { text, color } = computeAgeDisplay(ageMs, status);

  const absoluteDate = new Date(epochMs).toLocaleString("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const ariaLabel = label
    ? `${label} ${text}. Última sincronización: ${absoluteDate}`
    : `${text}. Última sincronización: ${absoluteDate}`;

  return (
    <span
      className={cn("text-sm", color)}
      title={absoluteDate}
      aria-label={ariaLabel}
      role="tooltip"
      tabIndex={0}
    >
      {label && <>{label} </>}
      {text}
    </span>
  );
}
