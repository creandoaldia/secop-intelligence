import { createHash } from "crypto";
import { SocrataProcessRow } from "./types";

// ─── Mapped Types ──────────────────────────────────────────

export interface MappedProceso {
  id: string;
  nombre: string;
  entidadId?: string;
  entidadNombre?: string;
  valor?: number;
  moneda: string;
  estado?: string;
  modalidad?: string;
  fechaPublicacion?: number;
  fechaCierre?: number;
  categoriaUnspc?: string;
  ubicacion?: string;
  departamento?: string;
  urlSecop?: string;
  hashContenido: string;
  fuente: "socrata";
  version: number;
  datosRaw: string;
}

export interface MappedEntidad {
  id: string;
  nombre: string;
  departamento?: string;
  municipio?: string;
}

// ─── Public API ────────────────────────────────────────────

export function mapSocrataRowToProceso(
  row: SocrataProcessRow,
  existingVersion?: number
): MappedProceso {
  const hash = computeHash(row);

  const mapped: MappedProceso = {
    id: row.id_del_proceso ?? "",
    nombre: row.nombre_del_procedimiento ?? "",
    entidadId: row.nit_entidad || undefined,
    entidadNombre: row.entidad || undefined,
    valor: parseNumericString(row.precio_base),
    moneda: "COP",
    estado: row.estado_del_procedimiento || row.estado_resumen || undefined,
    modalidad: row.modalidad_de_contratacion || undefined,
    fechaPublicacion: isoToUnix(row.fecha_de_publicacion_del),
    fechaCierre: undefined, // Not available in Socrata Fase 0
    categoriaUnspc: row.codigo_principal_de_categoria || undefined,
    ubicacion: row.ciudad_de_la_unidad_de || row.ciudad_entidad || undefined,
    departamento: row.departamento_entidad || undefined,
    urlSecop: extractUrl(row.urlproceso),
    hashContenido: hash,
    fuente: "socrata",
    version: existingVersion ? existingVersion + 1 : 1,
    datosRaw: JSON.stringify(row),
  };

  return mapped;
}

export function extractEntidad(row: SocrataProcessRow): MappedEntidad | null {
  if (!row.nit_entidad) return null;
  return {
    id: row.nit_entidad,
    nombre: row.entidad ?? "Unknown",
    departamento: row.departamento_entidad || undefined,
    municipio: row.ciudad_entidad || undefined,
  };
}

export function computeHash(row: SocrataProcessRow): string {
  // Sort keys for deterministic hash
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) {
    sorted[key] = row[key];
  }
  return createHash("sha256")
    .update(JSON.stringify(sorted))
    .digest("hex");
}

// ─── Internal Helpers ──────────────────────────────────────

export function isoToUnix(isoString?: string): number | undefined {
  if (!isoString) return undefined;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return undefined;
    return Math.floor(date.getTime() / 1000);
  } catch {
    return undefined;
  }
}

function parseNumericString(val?: string): number | undefined {
  if (val === undefined || val === null) return undefined;
  const cleaned = String(val).replace(/[^0-9.-]/g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? undefined : num;
}

function extractUrl(urlField: unknown): string | undefined {
  if (!urlField) return undefined;
  if (typeof urlField === "string") return urlField;
  if (typeof urlField === "object" && urlField !== null) {
    const obj = urlField as Record<string, unknown>;
    if (typeof obj.url === "string") return obj.url;
  }
  return undefined;
}
