"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPinIcon, BriefcaseIcon, CalendarIcon, Trash2Icon, UserIcon } from "lucide-react";

interface SenaProfile {
  id: number;
  nombre: string | null;
  profesion: string | null;
  habilidades: string[];
  experienciaAnos: number | null;
  ubicacion: string | null;
  fuente: string;
}

interface ProfileListProps {
  profiles: SenaProfile[];
}

export function ProfileList({ profiles }: ProfileListProps) {
  const router = useRouter();

  async function handleDelete(id: number) {
    if (!confirm("Eliminar este perfil?")) return;

    try {
      const res = await fetch(`/api/sena/profiles/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al eliminar");
      }

      router.refresh();
    } catch (err) {
      console.error("Error deleting profile:", err);
    }
  }

  if (profiles.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12">
          <UserIcon className="mb-4 size-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No tienes perfiles SENA creados
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Crea tu primer perfil para empezar a recibir recomendaciones
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {profiles.map((profile) => (
        <Card key={profile.id} size="sm">
          <CardHeader>
            <CardTitle className="text-sm">{profile.nombre}</CardTitle>
            <CardDescription className="flex items-center gap-1">
              <BriefcaseIcon className="size-3" />
              {profile.profesion}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {profile.habilidades.map((skill, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">
                  {skill}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {profile.experienciaAnos !== null && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="size-3" />
                  {profile.experienciaAnos} anos
                </span>
              )}
              {profile.ubicacion && (
                <span className="flex items-center gap-1">
                  <MapPinIcon className="size-3" />
                  {profile.ubicacion}
                </span>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => handleDelete(profile.id)}
            >
              <Trash2Icon className="size-3" />
              Eliminar
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
