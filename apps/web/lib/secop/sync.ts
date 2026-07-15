import { db } from "@/lib/db";
import { procesos, syncLog, entidades } from "@/lib/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { SocrataClient } from "./client";
import {
  mapSocrataRowToProceso,
  extractEntidad,
  computeHash,
} from "./mapper";
import {
  SocrataProcessRow,
  SocrataRateLimitError,
  SocrataNetworkError,
  SocrataTimeoutError,
  SyncStallError,
  SyncResult,
  SyncConfig,
  SyncMetrics,
} from "./types";
import {
  PAGE_SIZE_SOCRATA,
  SYNC_STALL_THRESHOLD,
  SYNC_STALE_TIMEOUT_MINUTES,
  SYNC_MAX_RETRIES,
} from "@/lib/constants";

// ─── Public API ────────────────────────────────────────────

export async function runSync(
  client: SocrataClient,
  config: SyncConfig
): Promise<SyncResult> {
  const pageSize = Math.min(config.pageSize ?? PAGE_SIZE_SOCRATA, PAGE_SIZE_SOCRATA);
  const stallThreshold = config.stallThreshold ?? SYNC_STALL_THRESHOLD;

  // Check if sync already running (with stale detection)
  const runningSync = await db
    .select()
    .from(syncLog)
    .where(
      and(
        eq(syncLog.fuente, "socrata"),
        eq(syncLog.estado, "running")
      )
    )
    .orderBy(syncLog.fechaInicio)
    .get();

  if (runningSync) {
    const elapsed = Math.floor(
      (Date.now() / 1000) - new Date(runningSync.fechaInicio).getTime() / 1000
    );
    if (elapsed < SYNC_STALE_TIMEOUT_MINUTES * 60) {
      return {
        status: "already_running",
        nuevos: 0,
        actualizados: 0,
        errores: 0,
        metricas: {
          lastProcessedOffset: 0,
          totalRequests: 0,
          rateLimitHits: 0,
          retriesTriggered: 0,
          totalWaitTimeMs: 0,
          avgRequestTimeMs: 0,
          newIdsSeenSample: [],
          consecutiveStalePages: 0,
        },
      };
    }
    // Stale running entry: mark as error so we can resume
    await db
      .update(syncLog)
      .set({
        estado: "error",
        fechaFin: new Date(),
        metricas: JSON.stringify({
          lastProcessedOffset: runningSync.metricas
            ? (JSON.parse(runningSync.metricas) as SyncMetrics).lastProcessedOffset ?? 0
            : 0,
        }),
      })
      .where(eq(syncLog.id, runningSync.id))
      .run();
  }

  // Determine start offset
  let startOffset = 0;
  if (config.mode === "full") {
    // Check for interrupted sync to resume
    const lastError = await db
      .select()
      .from(syncLog)
      .where(
        and(
          eq(syncLog.fuente, "socrata"),
          sql`${syncLog.estado} IN ('error', 'rate_limited')`
        )
      )
      .orderBy(sql`${syncLog.fechaInicio} DESC`)
      .get();

    if (lastError?.metricas) {
      try {
        const metrics = JSON.parse(lastError.metricas) as SyncMetrics;
        startOffset = metrics.lastProcessedOffset || 0;
      } catch { /* use default 0 */ }
    }
  } else {
    // Incremental: check for previous completed sync
    const lastDone = await db
      .select()
      .from(syncLog)
      .where(
        and(
          eq(syncLog.fuente, "socrata"),
          eq(syncLog.estado, "done")
        )
      )
      .orderBy(sql`${syncLog.fechaInicio} DESC`)
      .get();

    if (!lastDone) {
      // No prior sync: fall back to full mode
      return runSync(client, { ...config, mode: "full" });
    }
    // Incremental uses $where time filter, handled in fetch URL
    // The client doesn't need offset for incremental — we use $where
  }

  // Create sync log entry
  const now = new Date();
  const nowUnix = Math.floor(Date.now() / 1000);
  const syncId = (await db
    .insert(syncLog)
    .values({
      fuente: "socrata",
      fechaInicio: now,
      estado: "running",
      metricas: JSON.stringify({ lastProcessedOffset: startOffset }),
    })
    .returning({ id: syncLog.id })
    .get()).id;

  // Sync metrics
  const metrics: SyncMetrics = {
    lastProcessedOffset: startOffset,
    totalRequests: 0,
    rateLimitHits: 0,
    retriesTriggered: 0,
    totalWaitTimeMs: 0,
    avgRequestTimeMs: 0,
    newIdsSeenSample: [],
    consecutiveStalePages: 0,
  };

  let nuevos = 0;
  let actualizados = 0;
  let errores = 0;
  let offset = startOffset;

  try {
    while (true) {
      if (config.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const requestStart = Date.now();
      let rows: SocrataProcessRow[];

      try {
        rows = await client.fetchPage(offset, pageSize, config.signal);
        metrics.totalRequests++;
        metrics.avgRequestTimeMs = metrics.avgRequestTimeMs === 0
          ? (Date.now() - requestStart)
          : (metrics.avgRequestTimeMs + (Date.now() - requestStart)) / 2;
      } catch (err) {
        if (err instanceof SocrataRateLimitError) {
          metrics.rateLimitHits++;
          metrics.retriesTriggered += err.retryCount;
          metrics.totalWaitTimeMs += err.retryHistory.reduce((a, b) => a + b, 0);
          metrics.lastProcessedOffset = offset;
          await updateSyncLog(syncId, "rate_limited", metrics, nuevos, actualizados, errores);
          return {
            status: "rate_limited",
            nuevos,
            actualizados,
            errores,
            metricas: metrics,
          };
        }
        if (err instanceof SocrataNetworkError || err instanceof SocrataTimeoutError) {
          metrics.lastProcessedOffset = offset;
          await updateSyncLog(syncId, "error", metrics, nuevos, actualizados, errores + 1);
          return {
            status: "error",
            nuevos,
            actualizados,
            errores: errores + 1,
            metricas: metrics,
            error: err.message,
          };
        }
        throw err; // unexpected error, propagate
      }

      // End of data
      if (rows.length === 0) break;

      // Process page: batch SELECT existing hashes
      const ids = rows.map((r) => r.id_del_proceso).filter(Boolean) as string[];
      const existing = await db
        .select({ id: procesos.id, hashContenido: procesos.hashContenido, version: procesos.version })
        .from(procesos)
        .where(inArray(procesos.id, ids))
        .all();

      const existingMap = new Map(existing.map((e) => [e.id, { hash: e.hashContenido ?? "", version: e.version ?? 1 }]));

      // Separate new, changed, unchanged
      const toInsert: SocrataProcessRow[] = [];
      const toUpdate: Array<{ row: SocrataProcessRow; version: number }> = [];
      let newIdsInPage = 0;

      for (const row of rows) {
        const id = row.id_del_proceso;
        if (!id) continue;

        const existing = existingMap.get(id);
        if (!existing) {
          toInsert.push(row);
          newIdsInPage++;
        } else {
          const newHash = computeHash(row);
          if (newHash !== existing.hash) {
            toUpdate.push({ row, version: existing.version ?? 1 });
            newIdsInPage++;
          }
        }
      }

      // Insert new records (batch)
      if (toInsert.length > 0) {
        const mapped = toInsert.map((r) => mapSocrataRowToProceso(r));
        // Type cast via Record — MappedProceso and Drizzle insert type are structurally identical
        await db.insert(procesos).values(mapped as unknown as typeof procesos.$inferInsert[]).run();
        nuevos += toInsert.length;
      }

      // Update changed records (batch via individual updates)
      for (const { row, version } of toUpdate) {
        const mapped = mapSocrataRowToProceso(row, version);
        const updateData: Record<string, unknown> = {
          nombre: mapped.nombre,
          entidadId: mapped.entidadId,
          entidadNombre: mapped.entidadNombre,
          valor: mapped.valor,
          estado: mapped.estado,
          modalidad: mapped.modalidad,
          fechaPublicacion: mapped.fechaPublicacion,
          categoriaUnspc: mapped.categoriaUnspc,
          ubicacion: mapped.ubicacion,
          departamento: mapped.departamento,
          urlSecop: mapped.urlSecop,
          hashContenido: mapped.hashContenido,
          version: mapped.version,
          datosRaw: mapped.datosRaw,
          updatedAt: Math.floor(Date.now() / 1000),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.update(procesos).set(updateData as any).where(eq(procesos.id, mapped.id)).run();
        actualizados++;
      }

      // Entity auto-create
      for (const row of rows) {
        const entidad = extractEntidad(row);
        if (entidad) {
          await db
            .insert(entidades)
            .values({
              id: entidad.id,
              nombre: entidad.nombre,
              departamento: entidad.departamento,
              municipio: entidad.municipio,
            })
            .onConflictDoUpdate({
              target: entidades.id,
              set: {
                nombre: entidad.nombre,
                departamento: entidad.departamento,
                municipio: entidad.municipio,
              },
            })
            .run();
        }
      }

      // Track metrics
      metrics.lastProcessedOffset = offset;
      if (newIdsInPage === 0) {
        metrics.consecutiveStalePages++;
        if (metrics.consecutiveStalePages >= stallThreshold) {
          throw new SyncStallError(
            `Stall detected: ${metrics.consecutiveStalePages} consecutive pages with 0 new IDs`,
            metrics.consecutiveStalePages,
            offset
          );
        }
      } else {
        metrics.consecutiveStalePages = 0;
        if (metrics.newIdsSeenSample.length < 10) {
          metrics.newIdsSeenSample.push(...ids.slice(0, 10 - metrics.newIdsSeenSample.length));
        }
      }

      // Persist checkpoint after each page
      await updateSyncLog(syncId, "running", metrics, nuevos, actualizados, errores);

      offset += pageSize;
    }

    // Success
    await db
      .update(syncLog)
      .set({
        estado: "done",
        fechaFin: new Date(),
        registrosNuevos: nuevos,
        registrosActualizados: actualizados,
        errores,
        metricas: JSON.stringify(metrics),
      })
      .where(eq(syncLog.id, syncId))
      .run();

    return {
      status: "done",
      nuevos,
      actualizados,
      errores,
      metricas: metrics,
    };

  } catch (err) {
    if (err instanceof SyncStallError) {
      await updateSyncLog(syncId, "stalled", metrics, nuevos, actualizados, errores);
      return { status: "stalled", nuevos, actualizados, errores, metricas: metrics, error: err.message };
    }

    // Unexpected error
    await updateSyncLog(syncId, "error", metrics, nuevos, actualizados, errores);
    return {
      status: "error",
      nuevos,
      actualizados,
      errores,
      metricas: metrics,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Helpers ───────────────────────────────────────────────

async function updateSyncLog(
  syncId: number,
  estado: string,
  metrics: SyncMetrics,
  registrosNuevos: number,
  registrosActualizados: number,
  errores: number
): Promise<void> {
  await db
    .update(syncLog)
    .set({
      estado: estado as "running" | "done" | "error",
      registrosNuevos,
      registrosActualizados,
      errores,
      metricas: JSON.stringify(metrics),
    })
    .where(eq(syncLog.id, syncId))
    .run();
}
