"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GlobeIcon, UserIcon } from "lucide-react";

interface ConnectedStatusProps {
  profileId: string | null | undefined;
}

export function ConnectedStatus({ profileId }: ConnectedStatusProps) {
  if (!profileId) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <GlobeIcon className="size-4 text-muted-foreground" />
            LinkedIn
          </CardTitle>
          <CardDescription>
            Conecta tu cuenta de LinkedIn para publicar analisis directamente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Al conectar, podras compartir resultados de analisis en tu perfil de
            LinkedIn con un solo clic.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
            <GlobeIcon className="size-4 text-primary" />
            LinkedIn Conectado
        </CardTitle>
        <CardDescription>
          Tu cuenta de LinkedIn esta vinculada
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <UserIcon className="size-4 text-muted-foreground" />
          <span className="font-medium">{profileId}</span>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          Mock Mode
        </Badge>
      </CardContent>
    </Card>
  );
}
