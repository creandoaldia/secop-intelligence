import { auth } from "@/lib/auth"
import { canUseFeature, hasPagesRemaining } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { users, procesos, sourceHealth } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ProcesoDetail } from "@/components/procesos/proceso-detail"
import { AnalyzeButton } from "@/components/analysis/analyze-button"
import { AnalysisTracker } from "@/components/analysis/analysis-tracker"
import { ChevronLeftIcon } from "lucide-react"
import Link from "next/link"
import { getProcesoPricingHistory } from "@/lib/pricing-history"
import type { ChartPoint } from "@/components/procesos/pricing-history-chart"

export const dynamic = "force-dynamic"

interface PageProps {
  params: { id: string }
  searchParams: { analysis?: string }
}

async function getProceso(id: string) {
  const row = db
    .select()
    .from(procesos)
    .leftJoin(sourceHealth, eq(sourceHealth.source, "socrata"))
    .where(eq(procesos.id, id))
    .get()
  if (!row) return null
  return { ...row.procesos, lastSuccessAt: row.source_health?.lastSuccessAt ?? null }
}

export default async function ProcesoDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  let proceso: unknown
  let fetchError: string | null = null
  try {
    proceso = await getProceso(params.id)
  } catch (e) {
    if (e instanceof Error && e.message === "unauthorized") {
      redirect("/login")
    }
    fetchError = "Error al cargar el proceso. Intenta de nuevo."
  }

  if (!proceso && !fetchError) notFound()

  // Pricing history (isolated — query failure won't block the detail page)
  let pricingHistory: ChartPoint[] = [];
  let pricingError: string | null = null;
  if (!fetchError && proceso) {
    try {
      const raw = await getProcesoPricingHistory(params.id);
      pricingHistory = raw.map((p) => ({
        observedAt: p.observedAt.toISOString(),
        valor: p.valor,
      }));
    } catch (e) {
      pricingError = "Error al cargar historial de precios";
    }
  }

  const canAnalyze = canUseFeature(session.user.plan ?? "free", "analisis");
  const user = !canAnalyze ? null : await db
    .select({ pagesUsed: users.pagesUsed, plan: users.plan })
    .from(users)
    .where(eq(users.id, session.user.id))
    .get();
  const hasPages = user ? hasPagesRemaining(user.pagesUsed, user.plan, 1) : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/procesos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="size-4" />
          Volver
        </Link>

        {!fetchError && (
          <AnalyzeButton
            procesoId={params.id}
            disabled={!canAnalyze || !hasPages}
            disabledReason={
              !canAnalyze
                ? "Funcion no disponible en tu plan"
                : !hasPages
                ? "Has alcanzado el limite de paginas"
                : undefined
            }
          />
        )}
      </div>

      {fetchError ? (
        <div className="rounded-lg border border-destructive/50 p-6 text-center text-sm text-destructive">
          {fetchError}
        </div>
      ) : (
        <>
          <ProcesoDetail
            proceso={proceso as any}
            lastSuccessAt={(proceso as any).lastSuccessAt}
            pricingHistory={pricingHistory}
            pricingError={pricingError}
          />
          {searchParams?.analysis && (
            <AnalysisTracker
              key={searchParams.analysis}
              analysisId={searchParams.analysis}
              procesoId={params.id}
            />
          )}
        </>
      )}
    </div>
  )
}
