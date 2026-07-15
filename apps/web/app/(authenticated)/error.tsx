"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <AlertTriangle className="h-16 w-16 text-destructive" />
      <h2 className="text-xl font-semibold">Algo salio mal</h2>
      <p className="text-muted-foreground max-w-md">
        Ocurrio un error al cargar esta pagina. Intenta de nuevo.
      </p>
      <Button onClick={reset}>Intentar de nuevo</Button>
    </div>
  );
}
