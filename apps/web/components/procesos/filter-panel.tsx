"use client"

import { useCallback, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { FilterIcon, RotateCcwIcon } from "lucide-react"

const ESTADOS = [
  "Publicado",
  "Adjudicado",
  "En curso",
  "Terminado",
  "Cancelado",
  "Revocado",
]

const MODALIDADES = [
  "Licitacion publica",
  "Seleccion abreviada",
  "Contratacion directa",
  "Concurso de meritos",
  "Minima cuantia",
  "Regimen especial",
]

export function FilterPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [estado, setEstado] = useState(searchParams.get("estado") || "")
  const [modalidad, setModalidad] = useState(
    searchParams.get("modalidad") || ""
  )
  const [departamento, setDepartamento] = useState(
    searchParams.get("departamento") || ""
  )
  const [valorMin, setValorMin] = useState(
    searchParams.get("valorMin") || ""
  )
  const [valorMax, setValorMax] = useState(
    searchParams.get("valorMax") || ""
  )

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", "1")

    if (estado) params.set("estado", estado)
    else params.delete("estado")

    if (modalidad) params.set("modalidad", modalidad)
    else params.delete("modalidad")

    if (departamento) params.set("departamento", departamento)
    else params.delete("departamento")

    if (valorMin) params.set("valorMin", valorMin)
    else params.delete("valorMin")

    if (valorMax) params.set("valorMax", valorMax)
    else params.delete("valorMax")

    router.push(`/procesos?${params.toString()}`)
  }, [router, searchParams, estado, modalidad, departamento, valorMin, valorMax])

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("estado")
    params.delete("modalidad")
    params.delete("departamento")
    params.delete("valorMin")
    params.delete("valorMax")
    params.set("page", "1")
    router.push(`/procesos?${params.toString()}`)
    setEstado("")
    setModalidad("")
    setDepartamento("")
    setValorMin("")
    setValorMax("")
  }, [router, searchParams])

  const hasFilters = estado || modalidad || departamento || valorMin || valorMax

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Estado
        </label>
        <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Modalidad
        </label>
        <Select
          value={modalidad}
          onChange={(e) => setModalidad(e.target.value)}
        >
          <option value="">Todas</option>
          {MODALIDADES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Departamento
        </label>
        <Input
          placeholder="Ej: Cundinamarca"
          value={departamento}
          onChange={(e) => setDepartamento(e.target.value)}
          className="h-8 w-40"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Valor Min
        </label>
        <Input
          type="number"
          placeholder="0"
          value={valorMin}
          onChange={(e) => setValorMin(e.target.value)}
          className="h-8 w-32"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Valor Max
        </label>
        <Input
          type="number"
          placeholder="999999"
          value={valorMax}
          onChange={(e) => setValorMax(e.target.value)}
          className="h-8 w-32"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={applyFilters}>
          <FilterIcon className="size-3.5" />
          Aplicar
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <RotateCcwIcon className="size-3.5" />
            Limpiar
          </Button>
        )}
      </div>
    </div>
  )
}
