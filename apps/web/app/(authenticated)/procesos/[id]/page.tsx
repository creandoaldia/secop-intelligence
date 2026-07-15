import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { ProcesoDetail } from "@/components/procesos/proceso-detail"
import { ChevronLeftIcon } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

interface PageProps {
  params: { id: string }
}

async function getProceso(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const res = await fetch(`${baseUrl}/api/procesos/${id}`, {
    cache: "no-store",
  })

  if (res.status === 404) return null
  if (res.status === 401) throw new Error("unauthorized")
  if (!res.ok) throw new Error("Error al cargar proceso")

  return res.json()
}

export default async function ProcesoDetailPage({ params }: PageProps) {
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

  return (
    <div className="space-y-6">
      <Link
        href="/procesos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeftIcon className="size-4" />
        Volver
      </Link>

      {fetchError ? (
        <div className="rounded-lg border border-destructive/50 p-6 text-center text-sm text-destructive">
          {fetchError}
        </div>
      ) : (
        <ProcesoDetail proceso={proceso as any} />
      )}
    </div>
  )
}
