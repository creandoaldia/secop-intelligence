// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — OpenAI GPT-4o-mini Extractor
// Real implementation: extract structured data from pliego content
// ─────────────────────────────────────────────────────────────

import OpenAI from "openai";

// ─── Config ────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function isConfigured(): boolean {
  return !!OPENAI_API_KEY;
}

function notConfiguredError(): never {
  throw new Error(
    "OpenAI no configurado. Define OPENAI_API_KEY en .env"
  );
}

// ─── Types ─────────────────────────────────────────────────

export interface ExtractionResult {
  requisitosHabilitantes: Record<string, unknown>;
  garantias: Record<string, unknown>;
  cronograma: Record<string, unknown>;
  formaPago: Record<string, unknown>;
  experienciaRequerida: Record<string, unknown>;
  riesgos: Record<string, unknown>;
  resumen: string;
}

// ─── SDK Lazy Init ─────────────────────────────────────────

let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!isConfigured()) notConfiguredError();
  if (!_openai) {
    _openai = new OpenAI({ apiKey: OPENAI_API_KEY! });
  }
  return _openai;
}

// ─── System Prompt ─────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un asistente experto en contratacion publica colombiana (SECOP).
Tu funcion es extraer informacion ESTRUCTURADA de pliegos de contratacion.

Extrae SOLO lo que esta explícitamente en el texto. NO inventes.
Si una seccion no tiene informacion, devuelve un objeto vacio {} o "" segun corresponda.

Responde SIEMPRE con un JSON valido con esta estructura exacta:
{
  "requisitosHabilitantes": {
    "juridicos": string[],
    "financieros": string[],
    "tecnicos": string[]
  },
  "garantias": {
    "seriedadOferta": { "porcentaje": number | null, "descripcion": string },
    "cumplimiento": { "porcentaje": number | null, "descripcion": string },
    "calidadServicio": { "porcentaje": number | null, "descripcion": string }
  },
  "cronograma": {
    "fechasImportantes": Array<{ evento: string, fecha: string }>,
    "plazoEjecucion": string
  },
  "formaPago": {
    "anticipo": { "porcentaje": number | null, "descripcion": string },
    "formaPago": string,
    "supervision": string
  },
  "experienciaRequerida": {
    "anosExperiencia": number | null,
    "contratosSimilares": number | null,
    "requisitosEspecificos": string[]
  },
  "riesgos": {
    "principales": Array<{ riesgo: string, nivel: string, mitigacion: string }>
  },
  "resumen": "Resumen ejecutivo del pliego en maximo 3 parrafos"
}`;

// ─── Extraction ────────────────────────────────────────────

export async function extractFromDocument(
  ocrContent: string
): Promise<ExtractionResult> {
  if (!isConfigured()) notConfiguredError();

  const openai = getClient();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Extrae la informacion estructurada del siguiente pliego de contratacion:\n\n${ocrContent.slice(0, 120_000)}`,
      },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
    max_tokens: 8_000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI devolvio respuesta vacia");

  try {
    const parsed = JSON.parse(content) as ExtractionResult;
    return {
      requisitosHabilitantes: parsed.requisitosHabilitantes ?? {},
      garantias: parsed.garantias ?? {},
      cronograma: parsed.cronograma ?? {},
      formaPago: parsed.formaPago ?? {},
      experienciaRequerida: parsed.experienciaRequerida ?? {},
      riesgos: parsed.riesgos ?? {},
      resumen: parsed.resumen ?? "",
    };
  } catch (parseError) {
    throw new Error(
      `Error al parsear respuesta de OpenAI: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    );
  }
}

// ─── Token estimation ──────────────────────────────────────

export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for Spanish text
  return Math.ceil(text.length / 4);
}

export function isWithinTokenLimit(text: string, maxTokens: number = 120_000): boolean {
  return estimateTokens(text) <= maxTokens;
}
