import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { pacItems } from "@/lib/db/schema"
import { eq, and, asc } from "drizzle-orm"
import { PageHeader } from "@/components/shared/page-header"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarIcon } from "lucide-react"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>
}

const formatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const estadoBadge: Record<string, "default" | "secondary" | "outline" | "destructive" | "ghost" | "link"> = {
  publicado: "default",
  planeado: "outline",
  ejecutado: "secondary",
  cancelado: "destructive",
}

function formatCOP(valor: number | null): string {
  if (valor === null) return "No especificado"
  return formatter.format(valor)
}

export default async function PacPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const anno = parseInt(
    (Array.isArray(searchParams.anno)
      ? searchParams.anno[0]
      : searchParams.anno) || String(new Date().getFullYear())
  )

  const items = await db
    .select()
    .from(pacItems)
    .where(eq(pacItems.anno, anno))
    .orderBy(asc(pacItems.mesEstimado))
    .all()

  const grouped: Record<number, typeof items> = {}
  for (const item of items) {
    const mes = item.mesEstimado ?? 0
    if (!grouped[mes]) grouped[mes] = []
    grouped[mes].push(item)
  }

  const totalValor = items.reduce((sum, item) => sum + (item.valor ?? 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan Anual de Adquisiciones"
        description={`${anno} — ${items.length} item${items.length !== 1 ? "s" : ""} \u00B7 ${formatCOP(totalValor)} presupuestado`}
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarIcon className="mb-3 size-12 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            No hay datos del PAC para {anno}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Los datos se cargaran automaticamente desde las fuentes oficiales
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => {
            const mesItems = grouped[mes]
            if (!mesItems) return null

            const mesTotal = mesItems.reduce(
              (s, item) => s + (item.valor ?? 0),
              0
            )

            return (
              <Card key={mes}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{MESES[mes - 1]}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {mesItems.length} item{mesItems.length !== 1 ? "s" : ""} ·{" "}
                      {formatCOP(mesTotal)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {mesItems.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {item.descripcion}
                          </p>
                          {item.entidadNombre && (
                            <p className="text-xs text-muted-foreground">
                              {item.entidadNombre}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 sm:text-right">
                          <span className="text-sm tabular-nums">
                            {formatCOP(item.valor)}
                          </span>
                          {item.estado && (
                            <Badge
                              variant={estadoBadge[item.estado] ?? "outline"}
                            >
                              {item.estado}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
