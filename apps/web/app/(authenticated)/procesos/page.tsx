import { Suspense } from "react"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { SearchBar } from "@/components/procesos/search-bar"
import { FilterPanel } from "@/components/procesos/filter-panel"
import { ProcesosTable } from "@/components/procesos/procesos-table"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>
}

async function getProcesos(searchParams: Record<string, string | string[] | undefined>) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const params = new URLSearchParams()
  if (searchParams.search) params.set("search", String(searchParams.search))
  if (searchParams.estado) params.set("estado", String(searchParams.estado))
  if (searchParams.modalidad) params.set("modalidad", String(searchParams.modalidad))
  if (searchParams.departamento) params.set("departamento", String(searchParams.departamento))
  if (searchParams.valorMin) params.set("valorMin", String(searchParams.valorMin))
  if (searchParams.valorMax) params.set("valorMax", String(searchParams.valorMax))
  if (searchParams.page) params.set("page", String(searchParams.page))
  if (searchParams.pageSize) params.set("pageSize", String(searchParams.pageSize))
  if (searchParams.sortBy) params.set("sortBy", String(searchParams.sortBy))
  if (searchParams.sortOrder) params.set("sortOrder", String(searchParams.sortOrder))

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const res = await fetch(`${baseUrl}/api/procesos?${params.toString()}`, {
    cache: "no-store",
  })

  if (!res.ok) {
    if (res.status === 401) redirect("/login")
    throw new Error("Error al cargar procesos")
  }

  return res.json()
}

export default async function ProcesosPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  let data: { data: unknown[]; total: number; page: number; pageSize: number; pages: number }
  try {
    data = await getProcesos(searchParams)
  } catch {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Procesos</h1>
          <p className="text-sm text-muted-foreground">
            Explora y busca procesos de contratacion publica
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 p-6 text-center text-sm text-destructive">
          Error al cargar procesos. Intenta de nuevo.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Procesos</h1>
        <p className="text-sm text-muted-foreground">
          Explora y busca procesos de contratacion publica
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <SearchBar />
        </Suspense>
        <Suspense fallback={null}>
          <FilterPanel />
        </Suspense>
      </div>

      <Suspense
        fallback={
          <div className="py-12 text-center text-sm text-muted-foreground">
            Cargando...
          </div>
        }
      >
        <ProcesosTable
          data={data.data as any}
          total={data.total}
          page={data.page}
          pageSize={data.pageSize}
          pages={data.pages}
          sortBy={String(searchParams.sortBy || "fechaPublicacion")}
          sortOrder={String(searchParams.sortOrder || "desc")}
        />
      </Suspense>
    </div>
  )
}
