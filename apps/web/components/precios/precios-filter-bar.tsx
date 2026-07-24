"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SearchIcon, XIcon } from "lucide-react"

interface PreciosFilterBarProps {
  initialSearch?: string
  initialEntidad?: string
  initialFrom?: string
  initialTo?: string
  initialValorMin?: string
  initialValorMax?: string
}

export function PreciosFilterBar(props: PreciosFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const buildParams = useCallback(
    (form: HTMLFormElement) => {
      const params = new URLSearchParams()
      const fd = new FormData(form)

      const search = fd.get("search") as string
      const entidad = fd.get("entidad") as string
      const from = fd.get("from") as string
      const to = fd.get("to") as string
      const valorMin = fd.get("valorMin") as string
      const valorMax = fd.get("valorMax") as string

      if (search) params.set("search", search)
      if (entidad) params.set("entidad", entidad)
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      if (valorMin) params.set("valorMin", valorMin)
      if (valorMax) params.set("valorMax", valorMax)

      return params
    },
    []
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = buildParams(e.currentTarget)
    router.push(`/precios?${params.toString()}`)
  }

  function handleClear() {
    router.push("/precios")
  }

  const hasFilters = Array.from(searchParams.keys()).length > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="search" className="mb-1 block text-xs font-medium text-muted-foreground">
            Buscar proceso
          </label>
          <Input
            id="search"
            name="search"
            placeholder="Nombre del proceso..."
            defaultValue={props.initialSearch ?? ""}
          />
        </div>

        {/* Entidad */}
        <div className="w-[200px]">
          <label htmlFor="entidad" className="mb-1 block text-xs font-medium text-muted-foreground">
            Entidad
          </label>
          <Input
            id="entidad"
            name="entidad"
            placeholder="Nombre de entidad..."
            defaultValue={props.initialEntidad ?? ""}
          />
        </div>

        {/* From */}
        <div className="w-[180px]">
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-muted-foreground">
            Desde
          </label>
          <Input
            id="from"
            name="from"
            type="date"
            defaultValue={props.initialFrom ?? ""}
          />
        </div>

        {/* To */}
        <div className="w-[180px]">
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-muted-foreground">
            Hasta
          </label>
          <Input
            id="to"
            name="to"
            type="date"
            defaultValue={props.initialTo ?? ""}
          />
        </div>

        {/* Valor Min */}
        <div className="w-[160px]">
          <label htmlFor="valorMin" className="mb-1 block text-xs font-medium text-muted-foreground">
            Valor mínimo
          </label>
          <Input
            id="valorMin"
            name="valorMin"
            type="number"
            placeholder="COP"
            defaultValue={props.initialValorMin ?? ""}
          />
        </div>

        {/* Valor Max */}
        <div className="w-[160px]">
          <label htmlFor="valorMax" className="mb-1 block text-xs font-medium text-muted-foreground">
            Valor máximo
          </label>
          <Input
            id="valorMax"
            name="valorMax"
            type="number"
            placeholder="COP"
            defaultValue={props.initialValorMax ?? ""}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 items-center pb-px">
          <Button type="submit" variant="default" size="sm">
            <SearchIcon className="size-4 mr-1" />
            Filtrar
          </Button>
          {hasFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
              <XIcon className="size-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
