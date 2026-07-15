import { auth } from "@/lib/auth";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentProcesos } from "@/components/dashboard/recent-procesos";
import { ProcesosChart } from "@/components/dashboard/procesos-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="space-y-6">
      <WelcomeBanner user={session.user} />
      <StatsCards />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentProcesos />
        <ProcesosChart />
      </div>
    </div>
  );
}
