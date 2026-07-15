import { db } from "@/lib/db";
import { procesos, entidades, alertas } from "@/lib/db/schema";
import { eq, sql, count } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSearch, Building2, Bell, TrendingUp } from "lucide-react";

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

export async function StatsCards() {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const todayUnix = Math.floor(todayStart.getTime() / 1000);

  const [totalProcesos, publicadosHoy, totalEntidades, alertasActivas] =
    await Promise.all([
      db.select({ value: count() }).from(procesos).then((r) => r[0].value),
      db
        .select({ value: count() })
        .from(procesos)
        .where(sql`${procesos.fechaPublicacion} >= ${todayUnix}`)
        .then((r) => r[0].value),
      db.select({ value: count() }).from(entidades).then((r) => r[0].value),
      db
        .select({ value: count() })
        .from(alertas)
        .where(eq(alertas.activa, true))
        .then((r) => r[0].value),
    ]);

  const stats = [
    {
      title: "Total Procesos",
      value: formatNumber(totalProcesos),
      icon: FileSearch,
    },
    {
      title: "Publicados Hoy",
      value: formatNumber(publicadosHoy),
      icon: TrendingUp,
    },
    {
      title: "Entidades",
      value: formatNumber(totalEntidades),
      icon: Building2,
    },
    {
      title: "Alertas Activas",
      value: formatNumber(alertasActivas),
      icon: Bell,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
