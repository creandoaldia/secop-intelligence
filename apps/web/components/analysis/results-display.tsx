"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ExtractionResult {
  requisitosHabilitantes: Record<string, unknown> | null;
  garantias: Record<string, unknown> | null;
  cronograma: Record<string, unknown> | null;
  formaPago: Record<string, unknown> | null;
  experienciaRequerida: Record<string, unknown> | null;
  riesgos: Record<string, unknown> | null;
  resumen: string | null;
  confianza: number | null;
  modeloExtraccion: string | null;
  modeloVerificacion: string | null;
}

interface ResultsDisplayProps {
  result: ExtractionResult;
}

const tabConfig = [
  { id: "resumen", label: "Resumen" },
  { id: "requisitos", label: "Requisitos" },
  { id: "garantias", label: "Garantias" },
  { id: "cronograma", label: "Cronograma" },
  { id: "pago", label: "Forma de Pago" },
  { id: "experiencia", label: "Experiencia" },
  { id: "riesgos", label: "Riesgos" },
];

function JsonBlock({ data }: { data: Record<string, unknown> | string | null }) {
  if (!data) return <p className="text-xs text-muted-foreground">No disponible</p>;

  let parsed: Record<string, unknown>;
  if (typeof data === "string") {
    try { parsed = JSON.parse(data); } catch { return <p className="text-xs">{data}</p>; }
  } else {
    parsed = data;
  }

  return (
    <div className="space-y-2">
      {Object.entries(parsed).map(([key, value]) => (
        <div key={key} className="text-xs">
          <span className="font-medium text-foreground">{key}:</span>{" "}
          <span className="text-muted-foreground">
            {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ResultsDisplay({ result }: ResultsDisplayProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {result.confianza !== null && (
          <Badge variant="outline" className="text-[10px]">
            Confianza: {Math.round(result.confianza * 100)}%
          </Badge>
        )}
        {result.modeloExtraccion && (
          <Badge variant="secondary" className="text-[10px]">
            Extraccion: {result.modeloExtraccion}
          </Badge>
        )}
        {result.modeloVerificacion && (
          <Badge variant="secondary" className="text-[10px]">
            Verificacion: {result.modeloVerificacion}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="resumen">
        <TabsList>
          {tabConfig.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Resumen del Pliego</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {result.resumen ?? "No disponible"}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requisitos">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Requisitos Habilitantes</CardTitle>
              <CardDescription>
                Documentos y condiciones necesarias para participar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JsonBlock data={result.requisitosHabilitantes} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="garantias">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Garantias</CardTitle>
              <CardDescription>
                Garantias de seriedad, cumplimiento y calidad
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JsonBlock data={result.garantias} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cronograma">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Cronograma</CardTitle>
              <CardDescription>
                Fechas clave y hitos del proceso
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JsonBlock data={result.cronograma} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pago">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Forma de Pago</CardTitle>
              <CardDescription>
                Condiciones y plazos de pago
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JsonBlock data={result.formaPago} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="experiencia">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Experiencia Requerida</CardTitle>
              <CardDescription>
                Requisitos de experiencia del contratista
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JsonBlock data={result.experienciaRequerida} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="riesgos">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Riesgos Identificados</CardTitle>
              <CardDescription>
                Riesgos del proceso y como mitigarlos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JsonBlock data={result.riesgos} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
