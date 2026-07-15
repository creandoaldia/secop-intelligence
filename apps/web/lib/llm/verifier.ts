// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Anthropic Claude Haiku Verifier
// Real implementation: cross-validate extraction results
// Internal Judgment Day for analysis quality
// ─────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

// ─── Config ────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VERIFIER_MODEL = process.env.ANTHROPIC_VERIFIER_MODEL || "claude-3-haiku-20240307";

function isConfigured(): boolean {
  return !!ANTHROPIC_API_KEY;
}

function notConfiguredError(): never {
  throw new Error(
    "Anthropic no configurado. Define ANTHROPIC_API_KEY en .env"
  );
}

// ─── Types ─────────────────────────────────────────────────

export interface VerificationResult {
  corrections: Record<string, unknown>;
  confianza: number;
  errores: string[];
}

// ─── SDK Lazy Init ─────────────────────────────────────────

let _anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!isConfigured()) notConfiguredError();
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

// ─── System Prompt ─────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un revisor experto en contratacion publica colombiana (SECOP).
Tu funcion es VERIFICAR la extraccion de informacion de un pliego de contratacion.

Revisa cada campo extraido contra el texto original. Identifica:
1. INFORMACION FALTANTE: datos importantes que no fueron extraidos
2. INFORMACION INCORRECTA: datos que contradicen el texto original
3. ALUCINACIONES: datos que aparecen en la extraccion pero NO estan en el texto

Responde SIEMPRE con un JSON valido con esta estructura exacta:
{
  "confianza": 0.0-1.0,
  "errores": ["error 1", "error 2", ...],
  "correcciones": {
    "requisitosHabilitantes": { ... correcciones si aplican ... },
    "garantias": { ... },
    "cronograma": { ... },
    "formaPago": { ... },
    "experienciaRequerida": { ... },
    "riesgos": { ... }
  }
}

Donde confianza es tu nivel de confianza general (0.0 = pesimo, 1.0 = perfecto).
errores es una lista de los problemas encontrados (vacia si no hay).
correcciones solo incluye los campos que necesitan correccion.`;

// ─── Verification ──────────────────────────────────────────

export async function verifyExtraction(
  extractedData: Record<string, unknown>,
  originalText: string
): Promise<VerificationResult> {
  if (!isConfigured()) notConfiguredError();

  const anthropic = getClient();

  const truncatedText = originalText.slice(0, 80_000);
  const extractedJson = JSON.stringify(extractedData, null, 2).slice(0, 20_000);

  const response = await anthropic.messages.create({
    model: VERIFIER_MODEL,
    max_tokens: 4_000,
    temperature: 0.1,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Texto Original del Pliego (truncado)\n\n${truncatedText}\n\n## Datos Extraidos\n\n\`\`\`json\n${extractedJson}\n\`\`\`\n\nVerifica la extraccion. Identifica errores, omisiones y alucinaciones. Proporciona correcciones especificas.`,
      },
    ],
  });

  const content = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as Anthropic.TextBlock).text)
    .join("\n");

  if (!content) throw new Error("Anthropic devolvio respuesta vacia");

  // Extract JSON from the response (Claude may wrap it in markdown)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch?.[0] ?? content;

  try {
    const parsed = JSON.parse(jsonStr) as VerificationResult;
    return {
      confianza: typeof parsed.confianza === "number" ? parsed.confianza : 0.5,
      errores: Array.isArray(parsed.errores) ? parsed.errores : [],
      corrections: (parsed.corrections as Record<string, unknown>) ?? {},
    };
  } catch (parseError) {
    // If we can't parse, return a best-effort with low confidence
    return {
      corrections: {},
      confianza: 0.3,
      errores: [`No se pudo parsear la respuesta del verificador: ${parseError instanceof Error ? parseError.message : String(parseError)}`],
    };
  }
}
