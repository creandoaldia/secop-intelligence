"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { PlusIcon, LoaderCircleIcon } from "lucide-react"

interface AlertFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: AlertFormData) => Promise<void>
}

export interface AlertFormData {
  nombre: string
  palabrasClave: string[]
  departamento: string
  valorMin: number | undefined
  valorMax: number | undefined
  frecuencia: "inmediato" | "diario" | "semanal"
}

export function AlertForm({ open, onOpenChange, onSubmit }: AlertFormProps) {
  const [nombre, setNombre] = useState("")
  const [palabrasClave, setPalabrasClave] = useState("")
  const [departamento, setDepartamento] = useState("")
  const [valorMin, setValorMin] = useState("")
  const [valorMax, setValorMax] = useState("")
  const [frecuencia, setFrecuencia] = useState<
    "inmediato" | "diario" | "semanal"
  >("diario")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function reset() {
    setNombre("")
    setPalabrasClave("")
    setDepartamento("")
    setValorMin("")
    setValorMax("")
    setFrecuencia("diario")
    setError("")
  }

  async function handleSubmit() {
    if (!nombre.trim()) {
      setError("El nombre es requerido")
      return
    }

    setLoading(true)
    setError("")

    try {
      await onSubmit({
        nombre: nombre.trim(),
        palabrasClave: palabrasClave
          ? palabrasClave.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        departamento: departamento.trim(),
        valorMin: valorMin ? parseInt(valorMin) : undefined,
        valorMax: valorMax ? parseInt(valorMax) : undefined,
        frecuencia,
      })
      reset()
      onOpenChange(false)
    } catch {
      setError("Error al crear la alerta")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Alerta</DialogTitle>
          <DialogDescription>
            Configura una alerta para recibir notificaciones de nuevos procesos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Nombre *
            </label>
            <Input
              placeholder="Ej: Obras infraestructura"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Palabras Clave
            </label>
            <Input
              placeholder="Ej: obra, construccion, via (separadas por coma)"
              value={palabrasClave}
              onChange={(e) => setPalabrasClave(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Departamento
              </label>
              <Input
                placeholder="Ej: Antioquia"
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Frecuencia
              </label>
              <Select
                value={frecuencia}
                onChange={(e) =>
                  setFrecuencia(
                    e.target.value as "inmediato" | "diario" | "semanal"
                  )
                }
              >
                <option value="inmediato">Inmediato</option>
                <option value="diario">Diario</option>
                <option value="semanal">Semanal</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Valor Minimo
              </label>
              <Input
                type="number"
                placeholder="0"
                value={valorMin}
                onChange={(e) => setValorMin(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Valor Maximo
              </label>
              <Input
                type="number"
                placeholder="999999999"
                value={valorMax}
                onChange={(e) => setValorMax(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancelar
          </DialogClose>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <LoaderCircleIcon className="size-4 animate-spin" />}
            {loading ? "Creando..." : "Crear Alerta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
