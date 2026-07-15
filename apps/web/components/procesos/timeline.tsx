"use client"

import { CalendarIcon, FileCheckIcon, ClockIcon } from "lucide-react"

interface TimelineProps {
  fechaPublicacion: number | null
  fechaCierre: number | null
  fechaAdjudicacion: number | null
}

function formatDate(ts: number | null): string {
  if (!ts) return "Pendiente"
  return new Date(ts * 1000).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

const steps = [
  { key: "publicacion", label: "Publicacion", icon: CalendarIcon },
  { key: "cierre", label: "Cierre", icon: ClockIcon },
  { key: "adjudicacion", label: "Adjudicacion", icon: FileCheckIcon },
] as const

export function Timeline({
  fechaPublicacion,
  fechaCierre,
  fechaAdjudicacion,
}: TimelineProps) {
  const dates: Record<string, number | null> = {
    publicacion: fechaPublicacion,
    cierre: fechaCierre,
    adjudicacion: fechaAdjudicacion,
  }

  const activeCount = [fechaPublicacion, fechaCierre, fechaAdjudicacion].filter(
    Boolean
  ).length

  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const Icon = step.icon
        const date = dates[step.key]
        const isActive = !!date
        const isLast = index === steps.length - 1

        return (
          <div key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && (
              <div
                className={`absolute left-[11px] top-5 w-0.5 ${
                  index < activeCount - 1
                    ? "bg-primary"
                    : "bg-muted-foreground/20"
                }`}
                style={{ height: "calc(100% - 4px)" }}
              />
            )}
            <div
              className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full ${
                isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="size-3" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{step.label}</span>
              <span
                className={`text-xs ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {formatDate(date)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
