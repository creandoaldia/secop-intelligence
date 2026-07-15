// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — SENA Profile Types
// ─────────────────────────────────────────────────────────────

export interface SenaProfile {
  id: number;
  userId: string;
  nombre: string | null;
  profesion: string | null;
  habilidades: string[]; // parsed from JSON
  experienciaAnos: number | null;
  ubicacion: string | null;
  fuente: "sena_api" | "manual";
  datosRaw: string | null;
  createdAt: Date | number | null;
}

export interface SenaProfileInput {
  nombre: string;
  profesion: string;
  habilidades: string[];
  experienciaAnos: number;
  ubicacion: string;
}
