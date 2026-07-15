"use client"

import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Trash2Icon, BellIcon } from "lucide-react"

interface Alerta {
  id: number
  nombre: string
  palabrasClave: string | null
  entidadId: string | null
  valorMin: number | null
  valorMax: number | null
  departamento: string | null
  activa: boolean
  frecuencia: string
  createdAt: number | null
}

interface AlertListProps {
  alertas: Alerta[]
  onToggle: (id: number, activa: boolean) => void
  onDelete: (id: number) => void
}

const frecuenciaLabels: Record<string, string> = {
  inmediato: "Inmediato",
  diario: "Diario",
  semanal: "Semanal",
}

function formatDate(ts: number | null): string {
  if (!ts) return ""
  return new Date(ts * 1000).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function AlertList({ alertas, onToggle, onDelete }: AlertListProps) {
  if (alertas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BellIcon className="mb-3 size-12 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">
          No tienes alertas configuradas
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Crea una alerta para recibir notificaciones de nuevos procesos
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {alertas.map((alerta) => (
        <div
          key={alerta.id}
          className="flex items-start justify-between rounded-lg border p-4"
        >
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{alerta.nombre}</span>
              {!alerta.activa && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Inactiva
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {alerta.palabrasClave && (
                <span>Claves: {JSON.parse(alerta.palabrasClave).join(", ")}</span>
              )}
              {alerta.departamento && <span>Dpto: {alerta.departamento}</span>}
              {alerta.valorMin != null && (
                <span>
                  Desde: ${alerta.valorMin.toLocaleString("es-CO")}
                </span>
              )}
              {alerta.valorMax != null && (
                <span>
                  Hasta: ${alerta.valorMax.toLocaleString("es-CO")}
                </span>
              )}
              <span>Frec: {frecuenciaLabels[alerta.frecuencia]}</span>
              {alerta.createdAt && (
                <span>Creada: {formatDate(alerta.createdAt)}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <Switch
              checked={alerta.activa}
              onCheckedChange={(checked) => onToggle(alerta.id, checked)}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDelete(alerta.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
