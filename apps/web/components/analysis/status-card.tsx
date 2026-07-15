"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue } from "@/components/ui/progress";

type JobStatus = "pending" | "downloading" | "ocr" | "extracting" | "verifying" | "completed" | "failed";

const statusLabels: Record<JobStatus, string> = {
  pending: "Pendiente",
  downloading: "Descargando pliego",
  ocr: "Procesando OCR",
  extracting: "Extrayendo datos con IA",
  verifying: "Verificando resultados",
  completed: "Completado",
  failed: "Error",
};

const statusSteps: JobStatus[] = [
  "pending",
  "downloading",
  "ocr",
  "extracting",
  "verifying",
  "completed",
];

interface StatusCardProps {
  status: JobStatus;
  pagesTotal: number;
  pagesProcesadas: number;
  error?: string | null;
}

export function StatusCard({ status, pagesTotal, pagesProcesadas, error }: StatusCardProps) {
  const currentStepIndex = statusSteps.indexOf(status);
  const progress = pagesTotal > 0
    ? Math.round((pagesProcesadas / pagesTotal) * 100)
    : status === "completed" ? 100 : 0;

  const isError = status === "failed";

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          Estado del Analisis
          <Badge
            variant={isError ? "destructive" : status === "completed" ? "default" : "secondary"}
            className="text-[10px]"
          >
            {statusLabels[status]}
          </Badge>
        </CardTitle>
        <CardDescription>
          {isError
            ? error ?? "Error desconocido durante el procesamiento"
            : status === "completed"
            ? "Analisis completado exitosamente"
            : "Procesando documento..."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isError && (
          <Progress value={progress} />
        )}

        <div className="space-y-1.5">
          {statusSteps.map((step, i) => {
            const isActive = i === currentStepIndex;
            const isDone = i < currentStepIndex || status === "completed";
            const isFailed = status === "failed";

            return (
              <div
                key={step}
                className="flex items-center gap-2 text-xs"
              >
                <div
                  className={`size-2 rounded-full ${
                    isFailed
                      ? "bg-destructive"
                      : isDone
                      ? "bg-emerald-500"
                      : isActive
                      ? "bg-primary animate-pulse"
                      : "bg-muted-foreground/30"
                  }`}
                />
                <span
                  className={
                    isFailed
                      ? "text-destructive"
                      : isDone
                      ? "text-foreground"
                      : isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground/60"
                  }
                >
                  {statusLabels[step]}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
