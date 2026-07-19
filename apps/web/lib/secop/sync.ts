import { db } from "@/lib/db";
import { procesos, syncLog, entidades, sourceHealth } from "@/lib/db/schema";
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
  SocrataCircuitOpenError,
  SyncStallError,
  SyncResult,
  SyncConfig,
  SyncMetrics,
} from "./types";
import {
  PAGE_SIZE_SOCRATA,
  SYNC_STALL_THRESHOLD,
  SYNC_STALE_TIMEOUT_MINUTES,
} from "@/lib/constants";

// ─── Public API ────────────────────────────────────────────

export async function runSync(
  client: SocrataClient,
  config: SyncConfig
): Promise<SyncResult> {
  const pageSize = Math.min(config.pageSize ?? PAGE_SIZE_SOCRATA, PAGE_SIZE_SOCRATA);
  const stallThreshold = config.stallThreshold ?? SYNC_STALL_THRESHOLD;

  // Release abandoned leases before atomically claiming the next one.
  await db
    .update(syncLog)
    .set({ estado: "error", fechaFin: new Date() })
    .where(and(
      eq(syncLog.fuente, "socrata"),
      eq(syncLog.estado, "running"),
      sql`${syncLog.fechaInicio} < unixepoch() - ${SYNC_STALE_TIMEOUT_MINUTES * 60}`
    ))
    .run();

  const lease = await db.run(sql`
    INSERT INTO sync_log (fuente, estado, fecha_inicio, metricas)
    SELECT 'socrata', 'running', unixepoch(), ${JSON.stringify({ lastProcessedOffset: 0 })}
    WHERE NOT EXISTS (
      SELECT 1 FROM sync_log WHERE fuente = 'socrata' AND estado = 'running'
    )
  `);

  if (lease.changes === 0) return alreadyRunningResult();

  const leaseRow = await db
    .select({ id: syncLog.id })
    .from(syncLog)
    .where(and(eq(syncLog.fuente, "socrata"), eq(syncLog.estado, "running")))
    .orderBy(sql`${syncLog.id} DESC`)
    .get();

  if (!leaseRow) return alreadyRunningResult();

  // Determine start offset
  let startOffset = 0;
  const health = await db
    .select()
    .from(sourceHealth)
    .where(eq(sourceHealth.source, "socrata"))
    .get();
  const cursor = health?.watermarkDate && health.watermarkId
    ? { date: health.watermarkDate, id: health.watermarkId }
    : null;
  const incremental = config.mode === "incremental" && cursor !== null;

  if (!incremental) {
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
  }

  const syncId = leaseRow.id;
  const pageOptions = {
    ...(incremental && cursor ? { where: compoundWatermarkWhere(cursor.date, cursor.id) } : {}),
    order: "fecha_de_publicacion_del ASC, id_del_proceso ASC",
  };

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
        rows = await client.fetchPage(offset, pageSize, config.signal, pageOptions);
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

      const lastRow = rows[rows.length - 1];
      if (lastRow?.fecha_de_publicacion_del && lastRow.id_del_proceso) {
        await updateWatermark(lastRow.fecha_de_publicacion_del, lastRow.id_del_proceso);
      }

      offset += pageSize;
    }

    // Success
    await client.reportSuccess();
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
    if (err instanceof SocrataCircuitOpenError) {
      await updateSyncLog(syncId, "error", metrics, nuevos, actualizados, errores);
      return { status: "error", nuevos, actualizados, errores, metricas: metrics, error: err.message };
    }
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

function alreadyRunningResult(): SyncResult {
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

export function compoundWatermarkWhere(date: string, id: string): string {
  const quotedDate = date.replace(/'/g, "''");
  const quotedId = id.replace(/'/g, "''");
  return `fecha_de_publicacion_del >= '${quotedDate}' AND (fecha_de_publicacion_del > '${quotedDate}' OR id_del_proceso > '${quotedId}')`;
}

async function updateWatermark(date: string, id: string): Promise<void> {
  await db
    .insert(sourceHealth)
    .values({ source: "socrata", watermarkDate: date, watermarkId: id })
    .onConflictDoUpdate({
      target: sourceHealth.source,
      set: { watermarkDate: date, watermarkId: id, updatedAt: new Date() },
    })
    .run();
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
