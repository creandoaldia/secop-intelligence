"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon } from "lucide-react";

interface ProfileFormData {
  nombre: string;
  profesion: string;
  habilidades: string[];
  experienciaAnos: number;
  ubicacion: string;
}

export function ProfileForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormData>({
    nombre: "",
    profesion: "",
    habilidades: [],
    experienciaAnos: 0,
    ubicacion: "",
  });
  const [habilidadInput, setHabilidadInput] = useState("");

  function addHabilidad() {
    const trimmed = habilidadInput.trim();
    if (trimmed && !form.habilidades.includes(trimmed)) {
      setForm({ ...form, habilidades: [...form.habilidades, trimmed] });
      setHabilidadInput("");
    }
  }

  function removeHabilidad(index: number) {
    setForm({
      ...form,
      habilidades: form.habilidades.filter((_, i) => i !== index),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sena/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al crear perfil");
      }

      setOpen(false);
      setForm({ nombre: "", profesion: "", habilidades: [], experienciaAnos: 0, ubicacion: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        <PlusIcon className="size-4" />
        Nuevo Perfil
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear Perfil SENA</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre completo</Label>
            <Input
              id="nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profesion">Profesion</Label>
            <Input
              id="profesion"
              value={form.profesion}
              onChange={(e) => setForm({ ...form, profesion: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Habilidades</Label>
            <div className="flex gap-2">
              <Input
                value={habilidadInput}
                onChange={(e) => setHabilidadInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addHabilidad();
                  }
                }}
                placeholder="Escribe una habilidad y presiona Enter"
              />
              <Button type="button" variant="outline" size="sm" onClick={addHabilidad}>
                Agregar
              </Button>
            </div>
            {form.habilidades.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.habilidades.map((h, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                  >
                    {h}
                    <button
                      type="button"
                      onClick={() => removeHabilidad(i)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="experiencia">Anos de experiencia</Label>
            <Input
              id="experiencia"
              type="number"
              min={0}
              value={form.experienciaAnos}
              onChange={(e) => setForm({ ...form, experienciaAnos: parseInt(e.target.value) || 0 })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ubicacion">Ubicacion</Label>
            <Input
              id="ubicacion"
              value={form.ubicacion}
              onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Guardar Perfil"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
