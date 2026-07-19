import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentProcesos } from "@/components/dashboard/recent-procesos";
import { ProcesosChart } from "@/components/dashboard/procesos-chart";
import { db } from "@/lib/db";
import { procesos } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const monthNames = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function formatMes(mes: string): string {
  const [year, month] = mes.split("-");
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const chartData = db
    .select({
      mes: sql<string>`strftime('%Y-%m', fecha_publicacion, 'unixepoch')`,
      total: sql<number>`COUNT(*)`,
    })
    .from(procesos)
    .where(sql`fecha_publicacion IS NOT NULL`)
    .groupBy(sql`strftime('%Y-%m', fecha_publicacion, 'unixepoch')`)
    .orderBy(sql`strftime('%Y-%m', fecha_publicacion, 'unixepoch')`)
    .limit(12)
    .all()
    .map((row) => ({ ...row, mes: formatMes(row.mes) }));

  return (
    <div className="space-y-6">
      <WelcomeBanner user={session.user} />
      <StatsCards />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentProcesos />
        <ProcesosChart initialData={chartData} />
      </div>
    </div>
  );
}
