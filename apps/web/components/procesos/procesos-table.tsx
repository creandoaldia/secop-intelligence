"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

const formatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

interface Proceso {
  id: string
  nombre: string
  entidadNombre: string | null
  valor: number | null
  estado: string | null
  fechaPublicacion: number | null
}

interface ProcesosTableProps {
  data: Proceso[]
  total: number
  page: number
  pageSize: number
  pages: number
  sortBy: string
  sortOrder: string
}

const estadoVariant: Record<string, "default" | "secondary" | "outline"> = {
  Adjudicado: "default",
  "En curso": "secondary",
  Publicado: "outline",
}

function formatCOP(valor: number | null): string {
  if (valor === null) return "$0"
  try {
    return formatter.format(valor)
  } catch {
    return `$${valor.toLocaleString("es-CO")}`
  }
}

function formatDate(ts: number | null): string {
  if (!ts) return "—"
  return new Date(ts * 1000).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + "..."
}

export function ProcesosTable({
  data,
  total,
  page,
  pageSize,
  pages,
  sortBy,
  sortOrder,
}: ProcesosTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function navigate(url: string) {
    router.push(url)
  }

  function toggleSort(column: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (sortBy === column) {
      params.set("sortOrder", sortOrder === "asc" ? "desc" : "asc")
    } else {
      params.set("sortBy", column)
      params.set("sortOrder", "desc")
    }
    params.set("page", "1")
    router.push(`/procesos?${params.toString()}`)
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", String(p))
    router.push(`/procesos?${params.toString()}`)
  }

  function SortIcon({ column }: { column: string }) {
    if (sortBy !== column) return <span className="ml-1 text-muted-foreground/40">|</span>
    return (
      <span className="ml-1 text-muted-foreground">
        {sortOrder === "asc" ? "\u2191" : "\u2193"}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="w-[35%] cursor-pointer"
              onClick={() => toggleSort("nombre")}
            >
              Nombre <SortIcon column="nombre" />
            </TableHead>
            <TableHead
              className="hidden w-[20%] cursor-pointer md:table-cell"
              onClick={() => toggleSort("entidadNombre")}
            >
              Entidad <SortIcon column="entidadNombre" />
            </TableHead>
            <TableHead
              className="hidden w-[15%] cursor-pointer sm:table-cell"
              onClick={() => toggleSort("valor")}
            >
              Valor <SortIcon column="valor" />
            </TableHead>
            <TableHead
              className="w-[15%] cursor-pointer"
              onClick={() => toggleSort("estado")}
            >
              Estado <SortIcon column="estado" />
            </TableHead>
            <TableHead
              className="w-[15%] cursor-pointer"
              onClick={() => toggleSort("fechaPublicacion")}
            >
              Fecha <SortIcon column="fechaPublicacion" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-12 text-center text-muted-foreground"
              >
                No se encontraron procesos
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => navigate(`/procesos/${row.id}`)}
              >
                <TableCell className="font-medium">
                  {truncate(row.nombre, 60)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {row.entidadNombre ?? "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {formatCOP(row.valor)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={estadoVariant[row.estado ?? ""] ?? "outline"}
                  >
                    {row.estado ?? "Sin estado"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(row.fechaPublicacion)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} resultado{total !== 1 ? "s" : ""} — Pg {page} de {pages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
              let p: number
              if (pages <= 5) {
                p = i + 1
              } else if (page <= 3) {
                p = i + 1
              } else if (page >= pages - 2) {
                p = pages - 4 + i
              } else {
                p = page - 2 + i
              }
              return (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => goToPage(p)}
                  className="min-w-8"
                >
                  {p}
                </Button>
              )
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => goToPage(page + 1)}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
