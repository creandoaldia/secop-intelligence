"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { StatusCard } from "@/components/analysis/status-card"
import { ResultsDisplay } from "@/components/analysis/results-display"
import { Button } from "@/components/ui/button"
import { RotateCwIcon } from "lucide-react"
import type { AnalysisJobStatus } from "@/lib/analysis/types"

interface AnalysisJob {
  id: string
  estado: AnalysisJobStatus
  paginasTotal: number
  paginasProcesadas: number
  error?: string | null
}

interface AnalysisResult {
  requisitosHabilitantes: Record<string, unknown> | null
  garantias: Record<string, unknown> | null
  cronograma: Record<string, unknown> | null
  formaPago: Record<string, unknown> | null
  experienciaRequerida: Record<string, unknown> | null
  riesgos: Record<string, unknown> | null
  resumen: string | null
  confianza: number | null
  modeloExtraccion: string | null
  modeloVerificacion: string | null
}

interface AnalysisTrackerProps {
  analysisId: string | null | undefined
  procesoId: string
}

const PROCESSING_STATES = new Set([
  "pending", "downloading", "ocr", "extracting", "verifying",
])

export function AnalysisTracker({ analysisId, procesoId }: AnalysisTrackerProps) {
  const router = useRouter()
  const [job, setJob] = useState<AnalysisJob | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    setJob(null)
    setResult(null)
    setError(null)
    setRetrying(false)
  }, [analysisId])

  const poll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/analysis/${id}`)
      if (res.status === 404) return "continue"
      if (!res.ok) throw new Error("Error al consultar estado")
      const data = await res.json()
      setJob(data.job)
      setResult(data.result)

      if (data.job.estado === "completed" || data.job.estado === "failed") {
        return data.job.estado
      }
      return "continue"
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
      return "error"
    }
  }, [])

  useEffect(() => {
    if (!analysisId) return

    let active = true
    let interval: ReturnType<typeof setInterval> | null = null
    const id = analysisId

    async function startPolling() {
      const status = await poll(id)
      if (!active) return
      if (status === "completed" || status === "failed" || status === "error") return

      interval = setInterval(async () => {
        if (!active) return
        const s = await poll(id)
        if (!active) return
        if (s === "completed" || s === "failed" || s === "error") {
          clearInterval(interval!)
        }
      }, 3000)
    }

    startPolling()

    return () => {
      active = false
      if (interval) clearInterval(interval)
    }
  }, [analysisId, poll])

  async function handleRetry() {
    setRetrying(true)
    setError(null)
    try {
      const res = await fetch("/api/analysis/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ procesoId, paginasEstimadas: 1 }),
      })
      if (!res.ok) throw new Error("Error al reintentar")
      const data = await res.json()
      router.replace(`/procesos/${procesoId}?analysis=${data.jobId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al reintentar")
    } finally {
      setRetrying(false)
    }
  }

  if (!analysisId) return null

  if (error && !job) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/50 p-4 text-sm text-destructive">
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
          <RotateCwIcon className="size-4 mr-1" />
          {retrying ? "Reintentando..." : "Reintentar"}
        </Button>
      </div>
    )
  }

  if (job?.estado === "completed" && result) {
    return <ResultsDisplay result={result} />
  }

  if (job && PROCESSING_STATES.has(job.estado)) {
    return (
      <StatusCard
        status={job.estado as AnalysisJobStatus}
        pagesTotal={job.paginasTotal}
        pagesProcesadas={job.paginasProcesadas}
      />
    )
  }

  if (job?.estado === "failed") {
    return (
      <div className="space-y-4">
        <StatusCard
          status="failed"
          pagesTotal={job.paginasTotal}
          pagesProcesadas={job.paginasProcesadas}
          error={job.error}
        />
        <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
          <RotateCwIcon className="size-4 mr-1" />
          {retrying ? "Reintentando..." : "Reintentar"}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-8">
      <div className="text-sm text-muted-foreground animate-pulse">
        Iniciando analisis...
      </div>
    </div>
  )
}
