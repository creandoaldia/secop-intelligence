import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ExternalLinkIcon } from "lucide-react"
import { Timeline } from "@/components/procesos/timeline"
import { FreshnessBadge } from "@/components/freshness-badge"

const formatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

const estadoVariant: Record<string, "default" | "secondary" | "outline"> = {
  Adjudicado: "default",
  "En curso": "secondary",
  Publicado: "outline",
}

interface Proceso {
  id: string
  nombre: string
  entidadNombre: string | null
  entidadId: string | null
  valor: number | null
  moneda: string | null
  estado: string | null
  modalidad: string | null
  fechaPublicacion: number | null
  fechaCierre: number | null
  fechaAdjudicacion: number | null
  categoriaUnspc: string | null
  ubicacion: string | null
  departamento: string | null
  urlSecop: string | null
  urlPliego: string | null
  fuente: string | null
}

function formatCOP(valor: number | null): string {
  if (valor === null) return "No especificado"
  return formatter.format(valor)
}

function formatDate(ts: number | null): string {
  if (!ts) return "Por definir"
  return new Date(ts * 1000).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2 font-medium">{value}</span>
    </div>
  )
}

export function ProcesoDetail({ proceso, lastSuccessAt }: { proceso: Proceso; lastSuccessAt?: Date | number | null }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Informacion General</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <DetailRow label="Nombre" value={proceso.nombre} />
            <DetailRow
              label="Entidad"
              value={proceso.entidadNombre ?? "No especificado"}
            />
            <DetailRow
              label="Valor"
              value={formatCOP(proceso.valor)}
            />
            <DetailRow
              label="Estado"
              value={
                <Badge
                  variant={estadoVariant[proceso.estado ?? ""] ?? "outline"}
                >
                  {proceso.estado ?? "Sin estado"}
                </Badge>
              }
            />
            <DetailRow
              label="Modalidad"
              value={proceso.modalidad ?? "No especificado"}
            />
            <DetailRow
              label="Categoria UNSPC"
              value={proceso.categoriaUnspc ?? "No especificado"}
            />
            <DetailRow
              label="Fuente"
              value={proceso.fuente ?? "No especificado"}
            />
            <DetailRow
              label="Última sincronización de datos"
              value={<FreshnessBadge timestamp={lastSuccessAt ?? null} />}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ubicacion</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <DetailRow
              label="Departamento"
              value={proceso.departamento ?? "No especificado"}
            />
            <DetailRow
              label="Ubicacion"
              value={proceso.ubicacion ?? "No especificado"}
            />
          </CardContent>
        </Card>

        {(proceso.urlSecop || proceso.urlPliego) && (
          <Card>
            <CardHeader>
              <CardTitle>Enlaces</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {proceso.urlSecop && (
                <a
                  href={proceso.urlSecop}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLinkIcon className="size-4" />
                  Ver en SECOP
                </a>
              )}
              {proceso.urlPliego && (
                <a
                  href={proceso.urlPliego}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLinkIcon className="size-4" />
                  Descargar pliego
                </a>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle>Cronologia</CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline
              fechaPublicacion={proceso.fechaPublicacion}
              fechaCierre={proceso.fechaCierre}
              fechaAdjudicacion={proceso.fechaAdjudicacion}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
