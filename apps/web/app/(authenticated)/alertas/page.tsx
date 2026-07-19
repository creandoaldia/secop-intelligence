"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { AlertList } from "@/components/alertas/alert-list"
import { AlertForm, type AlertFormData } from "@/components/alertas/alert-form"
import { PlusIcon, LoaderCircleIcon } from "lucide-react"

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

export default function AlertasPage() {
  const router = useRouter()
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchAlertas = useCallback(async () => {
    try {
      const res = await fetch("/api/alertas")
      if (res.status === 401) {
        router.push("/login")
        return
      }
      if (!res.ok) throw new Error("Error al cargar alertas")
      const json = await res.json()
      setAlertas(json.data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchAlertas()
  }, [fetchAlertas])

  async function handleToggle(id: number, activa: boolean) {
    try {
      const res = await fetch(`/api/alertas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa }),
      })
      if (!res.ok) throw new Error("Error al actualizar alerta")
      setAlertas((prev) =>
        prev.map((a) => (a.id === id ? { ...a, activa } : a))
      )
    } catch (error) {
      console.error(error)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Eliminar esta alerta?")) return
    try {
      const res = await fetch(`/api/alertas/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Error al eliminar alerta")
      setAlertas((prev) => prev.filter((a) => a.id !== id))
    } catch (error) {
      console.error(error)
    }
  }

  async function handleCreate(data: AlertFormData) {
    const res = await fetch("/api/alertas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || "Error al crear alerta")
    }
    await fetchAlertas()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas"
        description="Recibe notificaciones cuando aparezcan nuevos procesos"
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <PlusIcon className="size-4" />
            Nueva Alerta
          </Button>
        }
      />

      <AlertList
        alertas={alertas}
        onToggle={handleToggle}
        onDelete={handleDelete}
      />

      <AlertForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />
    </div>
  )
}
