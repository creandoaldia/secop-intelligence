import { db } from "@/lib/db"
import { getDbStats } from "@/lib/db"
import { sourceHealth, syncLog } from "@/lib/db/schema"
import { desc } from "drizzle-orm"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorMessage } from "@/components/shared/error-message"

export const dynamic = "force-dynamic"

export default async function AdminSyncPage() {
  let sources: unknown[] = []
  let logs: unknown[] = []
  let error: string | null = null

  let stats = { totalUsuarios: 0, totalProcesos: 0, totalAnalisis: 0 }

  try {
    sources = await db.select().from(sourceHealth).all()
    logs = await db.select().from(syncLog).orderBy(desc(syncLog.fechaInicio)).limit(20).all()
    stats = getDbStats()
  } catch (e) {
    error = "Error al cargar datos de sincronizacion"
  }

  if (error) return <ErrorMessage message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel de Administracion"
        description="Estado de fuentes y sincronizacion"
      />

      <section>
        <h2 className="text-sm font-semibold mb-3">Estadisticas Rapidas</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{stats.totalUsuarios}</p>
            <p className="text-xs text-muted-foreground">Usuarios</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{stats.totalProcesos}</p>
            <p className="text-xs text-muted-foreground">Procesos</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{stats.totalAnalisis}</p>
            <p className="text-xs text-muted-foreground">Analisis</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3">Estado de Fuentes</h2>
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">Fuente</th>
                <th className="p-3 text-left font-medium">Estado</th>
                <th className="p-3 text-left font-medium">Fallos</th>
                <th className="p-3 text-left font-medium">Ultimo exito</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s: any) => (
                <tr key={s.source} className="border-b last:border-0">
                  <td className="p-3">{s.source}</td>
                  <td className="p-3">
                    <span className={`text-xs font-medium ${
                      s.status === "healthy" ? "text-emerald-600" :
                      s.status === "degraded" ? "text-amber-600" :
                      "text-destructive"
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="p-3">{s.consecutiveFailures}</td>
                  <td className="p-3">
                    {s.lastSuccessAt ? s.lastSuccessAt.toLocaleString("es-CO") : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3">Registro de Sincronizacion</h2>
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">Fuente</th>
                <th className="p-3 text-left font-medium">Inicio</th>
                <th className="p-3 text-left font-medium">Fin</th>
                <th className="p-3 text-left font-medium">Nuevos</th>
                <th className="p-3 text-left font-medium">Actualizados</th>
                <th className="p-3 text-left font-medium">Errores</th>
                <th className="p-3 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l: any) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="p-3">{l.fuente}</td>
                  <td className="p-3">
                    {l.fechaInicio.toLocaleString("es-CO")}
                  </td>
                  <td className="p-3">
                    {l.fechaFin
                      ? l.fechaFin.toLocaleString("es-CO")
                      : l.estado === "running"
                        ? "En curso"
                        : "N/A"
                    }
                  </td>
                  <td className="p-3">{l.registrosNuevos}</td>
                  <td className="p-3">{l.registrosActualizados}</td>
                  <td className="p-3">{l.errores}</td>
                  <td className="p-3">
                    <span className={`text-xs font-medium ${
                      l.estado === "done" ? "text-emerald-600" :
                      l.estado === "running" ? "text-amber-600" :
                      l.estado === "error" || l.estado === "stalled" || l.estado === "rate_limited"
                        ? "text-destructive"
                        : ""
                    }`}>
                      {l.estado === "done" ? "Completado" :
                       l.estado === "running" ? "En curso" :
                       l.estado === "error" ? "Error" :
                       l.estado === "rate_limited" ? "Limitado" :
                       l.estado === "stalled" ? "Estancado" : l.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
