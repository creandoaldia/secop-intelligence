// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — OpenAI GPT-4o-mini Wrapper
// All functions throw "No configurado" when API key is missing
// ─────────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function isConfigured(): boolean {
  return !!OPENAI_API_KEY;
}

function notConfiguredError(): never {
  throw new Error(
    "OpenAI no configurado. Define OPENAI_API_KEY en .env"
  );
}

export interface ExtractionResult {
  requisitosHabilitantes: Record<string, unknown>;
  garantias: Record<string, unknown>;
  cronograma: Record<string, unknown>;
  formaPago: Record<string, unknown>;
  experienciaRequerida: Record<string, unknown>;
  riesgos: Record<string, unknown>;
  resumen: string;
}

/**
 * Extract structured data from a document using GPT-4o-mini.
 */
export async function extractFromDocument(
  _ocrContent: string
): Promise<ExtractionResult> {
  if (!isConfigured()) notConfiguredError();
  throw new Error("Extraccion LLM no implementada — Fase 2B");
}
