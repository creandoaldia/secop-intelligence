"use client"

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"


// ─── Types ─────────────────────────────────────────────────

export interface ChartDataPoint {
  procesoId: string
  procesoNombre: string
  entidadNombre: string | null
  valor: number
  observedAt: string
}

interface PreciosHistoryChartProps {
  data: ChartDataPoint[]
}

// ─── Formatters ────────────────────────────────────────────

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

const compactFormatter = new Intl.NumberFormat("es-CO", {
  notation: "compact",
  maximumFractionDigits: 0,
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function formatAxisDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    month: "short",
    day: "numeric",
  })
}

// ─── States ────────────────────────────────────────────────

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolución de Precios</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="py-12 text-center text-sm text-muted-foreground">
          No hay datos de precios aún. Los precios se registrarán
          automáticamente con cada sincronización.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Custom Tooltip ────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload as ChartDataPoint
  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm text-xs space-y-1">
      <p className="font-medium">{row.procesoNombre}</p>
      {row.entidadNombre && (
        <p className="text-muted-foreground">{row.entidadNombre}</p>
      )}
      <p className="font-semibold">{copFormatter.format(row.valor)}</p>
      <p className="text-muted-foreground">{formatDate(row.observedAt)}</p>
    </div>
  )
}

// ─── Chart ─────────────────────────────────────────────────

function Chart({ data }: { data: ChartDataPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolución de Precios</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
              <XAxis
                dataKey="observedAt"
                tick={{ fontSize: 11 }}
                tickFormatter={formatAxisDate}
                minTickGap={40}
                name="Fecha"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => compactFormatter.format(v)}
                width={80}
                name="Valor"
              />
              <Tooltip content={<CustomTooltip />} />
              <Scatter
                data={data}
                dataKey="valor"
                fill="hsl(var(--primary))"
                opacity={0.7}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Cada punto representa un registro de precio. Pasa el mouse sobre un punto para ver detalles.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Main Export ───────────────────────────────────────────

export function PreciosHistoryChart({ data }: PreciosHistoryChartProps) {
  if (data.length === 0) return <EmptyState />
  return <Chart data={data} />
}
