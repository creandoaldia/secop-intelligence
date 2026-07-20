import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sourceHealth } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const healthRow = db
    .select({ lastSuccessAt: sourceHealth.lastSuccessAt, status: sourceHealth.status })
    .from(sourceHealth)
    .where(eq(sourceHealth.source, "socrata"))
    .get();

  const isAdmin = (session.user as any).role === "admin";

  return (
    <div className="flex min-h-screen">
      <Sidebar user={session.user} />
      <div className="flex flex-1 flex-col">
        <Header
          user={session.user}
          lastSuccessAt={isAdmin ? null : (healthRow?.lastSuccessAt ?? null)}
          sourceStatus={isAdmin ? null : (healthRow?.status ?? null)}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
