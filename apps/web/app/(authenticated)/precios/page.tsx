// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — /precios Page
// Server component: aggregate pricing history view with filters
// ─────────────────────────────────────────────────────────────

import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import {
  getPricingHistory,
  getPricingHistorySummary,
} from "@/lib/pricing-history"
import type { PricingHistoryFilters } from "@/lib/pricing-history"
import { PageHeader } from "@/components/shared/page-header"
import { PreciosFilterBar } from "@/components/precios/precios-filter-bar"
import { PreciosSummaryCards } from "@/components/precios/precios-summary-cards"
import { PreciosHistoryChart } from "@/components/precios/precios-history-chart"
import type { ChartDataPoint } from "@/components/precios/precios-history-chart"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: {
    search?: string
    entidad?: string
    from?: string
    to?: string
    valorMin?: string
    valorMax?: string
  }
}

// ─── Filter Parsing ────────────────────────────────────────

function parseFilters(sp: PageProps["searchParams"]): PricingHistoryFilters {
  const filters: PricingHistoryFilters = {}

  if (sp.search) filters.search = sp.search
  if (sp.entidad) filters.entidad = sp.entidad

  if (sp.from) {
    const d = new Date(sp.from)
    if (!isNaN(d.getTime())) filters.from = d
  }
  if (sp.to) {
    // Inclusive end-of-day: advance to midnight next day so `lte` catches same-day records
    const d = new Date(sp.to)
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1)
      filters.to = d
    }
  }
  if (sp.valorMin) {
    const n = Number(sp.valorMin)
    if (!isNaN(n)) filters.valorMin = n
  }
  if (sp.valorMax) {
    const n = Number(sp.valorMax)
    if (!isNaN(n)) filters.valorMax = n
  }

  return filters
}

// ─── Page ──────────────────────────────────────────────────

export default async function PreciosPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const filters = parseFilters(searchParams)

  let data: ChartDataPoint[] = []
  let summary = { count: 0, average: null as number | null, min: null as number | null, max: null as number | null }
  let error: string | null = null

  try {
    const [rows, summaryData] = await Promise.all([
      getPricingHistory(filters),
      getPricingHistorySummary(filters),
    ])
    data = rows.map((r) => ({
      procesoId: r.procesoId,
      procesoNombre: r.procesoNombre,
      entidadNombre: r.entidadNombre,
      valor: r.valor,
      observedAt: r.observedAt.toISOString(),
    }))
    summary = summaryData
  } catch (e) {
    error = "Error al cargar historial de precios. Intenta de nuevo."
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historial de Precios"
        description="Evolución de valores de procesos SECOP a lo largo del tiempo"
      />

      <PreciosFilterBar
        initialSearch={searchParams.search}
        initialEntidad={searchParams.entidad}
        initialFrom={searchParams.from}
        initialTo={searchParams.to}
        initialValorMin={searchParams.valorMin}
        initialValorMax={searchParams.valorMax}
      />

      {error ? (
        <div className="rounded-lg border border-destructive/50 p-6 text-center text-sm text-destructive">
          {error}
        </div>
      ) : (
        <>
          <PreciosSummaryCards summary={summary} />
          <PreciosHistoryChart data={data} />
        </>
      )}
    </div>
  )
}
