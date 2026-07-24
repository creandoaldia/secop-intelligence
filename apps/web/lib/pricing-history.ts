// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Pricing History
// Capture and query module for proceso valor evolution
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { procesos, procesoPricingHistory } from "@/lib/db/schema";
import { eq, inArray, sql, and, like, gte, lte, asc, desc } from "drizzle-orm";

// ─── Public Types ──────────────────────────────────────────

export interface PricingHistoryPoint {
  procesoId: string;
  valor: number;
  observedAt: Date;
  source: string | null;
  syncLogId: number | null;
}

export interface PricingHistoryRow {
  procesoId: string;
  procesoNombre: string;
  entidadNombre: string | null;
  valor: number;
  observedAt: Date;
}

export interface PricingHistoryFilters {
  search?: string;
  entidad?: string;
  from?: Date;
  to?: Date;
  valorMin?: number;
  valorMax?: number;
}

export interface PricingHistorySummary {
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
}

// ─── Capture (used by sync) ─────────────────────────────────

/**
 * Compare each touched proceso's current valor against its latest snapshot
 * and insert a new row only when the value changed and is non-null.
 */
export async function capturePricingSnapshots(
  touchedProcesoIds: string[],
  syncLogId: number
): Promise<void> {
  if (touchedProcesoIds.length === 0) return;

  // Batch-read current valores
  const currentValores = await db
    .select({ id: procesos.id, valor: procesos.valor })
    .from(procesos)
    .where(inArray(procesos.id, touchedProcesoIds))
    .all();

  if (currentValores.length === 0) return;

  // Batch-read existing snapshots for the same procesos
  const allSnapshots = await db
    .select({
      procesoId: procesoPricingHistory.procesoId,
      valor: procesoPricingHistory.valor,
      observedAt: procesoPricingHistory.observedAt,
    })
    .from(procesoPricingHistory)
    .where(inArray(procesoPricingHistory.procesoId, touchedProcesoIds))
    .all();

  // Build map of latest snapshot valor per proceso
  const latestValor = new Map<string, number>();
  const latestTime = new Map<string, Date>();
  for (const snap of allSnapshots) {
    const prevTime = latestTime.get(snap.procesoId);
    if (prevTime === undefined || snap.observedAt > prevTime) {
      latestValor.set(snap.procesoId, snap.valor);
      latestTime.set(snap.procesoId, snap.observedAt);
    }
  }

  // Determine which procesos need a new snapshot
  const toInsert: Array<typeof procesoPricingHistory.$inferInsert> = [];
  const now = new Date();

  for (const p of currentValores) {
    if (p.valor === null || p.valor === undefined) continue;
    const prev = latestValor.get(p.id);
    if (prev === undefined || prev !== p.valor) {
      toInsert.push({
        procesoId: p.id,
        valor: p.valor,
        observedAt: now,
        source: "socrata",
        syncLogId,
      });
    }
  }

  if (toInsert.length > 0) {
    await db.insert(procesoPricingHistory).values(toInsert).run();
  }
}

// ─── Queries ───────────────────────────────────────────────

/**
 * Get chronological pricing history for a single proceso.
 */
export async function getProcesoPricingHistory(
  procesoId: string
): Promise<PricingHistoryPoint[]> {
  return db
    .select({
      procesoId: procesoPricingHistory.procesoId,
      valor: procesoPricingHistory.valor,
      observedAt: procesoPricingHistory.observedAt,
      source: procesoPricingHistory.source,
      syncLogId: procesoPricingHistory.syncLogId,
    })
    .from(procesoPricingHistory)
    .where(eq(procesoPricingHistory.procesoId, procesoId))
    .orderBy(asc(procesoPricingHistory.observedAt))
    .all();
}

/**
 * Get filtered pricing history across procesos (for /precios).
 * Joins with procesos for search and entidad filtering.
 */
export async function getPricingHistory(
  filters: PricingHistoryFilters
): Promise<PricingHistoryRow[]> {
  const conditions = buildFilterConditions(filters);

  return db
    .select({
      procesoId: procesoPricingHistory.procesoId,
      procesoNombre: procesos.nombre,
      entidadNombre: procesos.entidadNombre,
      valor: procesoPricingHistory.valor,
      observedAt: procesoPricingHistory.observedAt,
    })
    .from(procesoPricingHistory)
    .innerJoin(procesos, eq(procesoPricingHistory.procesoId, procesos.id))
    .where(and(...conditions))
    .orderBy(desc(procesoPricingHistory.observedAt))
    .all();
}

/**
 * Get summary statistics from filtered pricing history.
 */
export async function getPricingHistorySummary(
  filters: PricingHistoryFilters
): Promise<PricingHistorySummary> {
  const conditions = buildFilterConditions(filters);

  const result = await db
    .select({
      count: sql<number>`count(*)`.as("count"),
      average: sql<number | null>`avg(${procesoPricingHistory.valor})`.as("average"),
      min: sql<number | null>`min(${procesoPricingHistory.valor})`.as("min"),
      max: sql<number | null>`max(${procesoPricingHistory.valor})`.as("max"),
    })
    .from(procesoPricingHistory)
    .innerJoin(procesos, eq(procesoPricingHistory.procesoId, procesos.id))
    .where(and(...conditions))
    .get();

  return {
    count: result?.count ?? 0,
    average: result?.average ?? null,
    min: result?.min ?? null,
    max: result?.max ?? null,
  };
}

// ─── Internal Helpers ──────────────────────────────────────

function buildFilterConditions(filters: PricingHistoryFilters) {
  const conditions: ReturnType<typeof and>[] = [];

  if (filters.search) {
    conditions.push(like(procesos.nombre, `%${filters.search}%`));
  }
  if (filters.entidad) {
    conditions.push(eq(procesos.entidadNombre, filters.entidad));
  }
  if (filters.from) {
    conditions.push(gte(procesoPricingHistory.observedAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(procesoPricingHistory.observedAt, filters.to));
  }
  if (filters.valorMin !== undefined) {
    conditions.push(gte(procesoPricingHistory.valor, filters.valorMin));
  }
  if (filters.valorMax !== undefined) {
    conditions.push(lte(procesoPricingHistory.valor, filters.valorMax));
  }

  return conditions;
}
