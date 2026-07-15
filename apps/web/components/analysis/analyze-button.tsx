"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BrainIcon, LoaderIcon } from "lucide-react";

interface AnalyzeButtonProps {
  procesoId: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function AnalyzeButton({
  procesoId,
  disabled,
  disabledReason,
}: AnalyzeButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/analysis/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ procesoId, paginasEstimadas: 1 }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al iniciar analisis");
      }

      router.push(`/procesos/${procesoId}?analysis=${data.jobId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        variant="default"
        size="sm"
        onClick={handleClick}
        disabled={loading || disabled}
      >
        {loading ? (
          <LoaderIcon className="size-4 animate-spin" />
        ) : (
          <BrainIcon className="size-4" />
        )}
        {loading ? "Analizando..." : "Analizar"}
      </Button>
      {(disabled && disabledReason) && (
        <p className="text-[10px] text-muted-foreground">{disabledReason}</p>
      )}
      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}
