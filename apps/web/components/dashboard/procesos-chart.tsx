"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ChartData {
  mes: string;
  total: number;
}

const monthNames = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function generateLast12Months(): { label: string; start: Date; end: Date }[] {
  const now = new Date();
  const months: { label: string; start: Date; end: Date }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({
      label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
      start: d,
      end,
    });
  }
  return months;
}

export function ProcesosChart({
  initialData: _initialData,
}: {
  initialData?: ChartData[];
}) {
  const months = useMemo(() => generateLast12Months(), []);

  // Build chart data from month boundaries — data is fetched
  // server-side in a production scenario. Here we use a client-side
  // fetch or the initialData prop. For now we show an empty chart
  // that real data will hydrate into.
  const data = _initialData ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Procesos por Mes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 13,
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Bar
                  dataKey="total"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Datos de grafico proximamente
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
