"use client";

import { cn } from "@/lib/utils";
import { CheckIcon, XIcon } from "lucide-react";

interface FeatureRow {
  feature: string;
  free: boolean;
  basic: boolean;
  pro: boolean;
  premium: boolean;
}

const featureRows: FeatureRow[] = [
  { feature: "Paginas de pliegos/mes", free: true, basic: true, pro: true, premium: true },
  { feature: "Limite paginas/mes", free: true, basic: true, pro: true, premium: true },
  { feature: "Analisis IA de pliegos", free: false, basic: true, pro: true, premium: true },
  { feature: "Alertas personalizadas", free: true, basic: true, pro: true, premium: true },
  { feature: "Exportacion de datos", free: false, basic: true, pro: true, premium: true },
  { feature: "Integracion LinkedIn", free: false, basic: false, pro: true, premium: true },
  { feature: "Perfiles SENA ilimitados", free: false, basic: false, pro: true, premium: true },
  { feature: "API de datos SECOP", free: false, basic: false, pro: false, premium: true },
  { feature: "Soporte prioritario", free: false, basic: false, pro: true, premium: true },
  { feature: "Asistente dedicado", free: false, basic: false, pro: false, premium: true },
];

const columns: { key: keyof FeatureRow; label: string }[] = [
  { key: "free", label: "Free" },
  { key: "basic", label: "Basic" },
  { key: "pro", label: "Pro" },
  { key: "premium", label: "Premium" },
];

export function PlanFeatures() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-3 pr-4 font-medium text-muted-foreground">Caracteristica</th>
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-3 text-center font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {featureRows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-2.5 pr-4 text-muted-foreground">{row.feature}</td>
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2.5 text-center">
                  {row[col.key] ? (
                    <CheckIcon className="mx-auto size-4 text-emerald-500" />
                  ) : (
                    <XIcon className="mx-auto size-4 text-muted-foreground/40" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
