"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// ─── Types ─────────────────────────────────────────────────

export interface ChartPoint {
  observedAt: string // ISO string — serialized server-side
  valor: number
}

interface PricingHistoryChartProps {
  data: ChartPoint[]
  error?: string | null
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
        <CardTitle>Historial de Precios</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay historial de precios aún
        </p>
      </CardContent>
    </Card>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de Precios</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-destructive">{message}</p>
      </CardContent>
    </Card>
  )
}

// ─── Chart ─────────────────────────────────────────────────

function Chart({ data }: { data: ChartPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de Precios</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
              <XAxis
                dataKey="observedAt"
                tick={{ fontSize: 11 }}
                tickFormatter={formatAxisDate}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => compactFormatter.format(v)}
                width={70}
              />
              <Tooltip
                formatter={(value) => {
                  const v = Number(value);
                  return isNaN(v) ? [String(value), "Valor"] : [copFormatter.format(v), "Valor"];
                }}
                labelFormatter={(label) => formatDate(String(label))}
              />
              <Line
                type="monotone"
                dataKey="valor"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 1.5 }}
                activeDot={{ r: 5, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Export ───────────────────────────────────────────

export function PricingHistoryChart({ data, error }: PricingHistoryChartProps) {
  if (error) return <ErrorState message={error} />
  if (data.length === 0) return <EmptyState />
  return <Chart data={data} />
}
