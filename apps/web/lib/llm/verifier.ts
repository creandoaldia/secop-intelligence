// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Anthropic Claude Haiku Wrapper
// All functions throw "No configurado" when API key is missing
// ─────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function isConfigured(): boolean {
  return !!ANTHROPIC_API_KEY;
}

function notConfiguredError(): never {
  throw new Error(
    "Anthropic no configurado. Define ANTHROPIC_API_KEY en .env"
  );
}

export interface VerificationResult {
  corrections: Record<string, unknown>;
  confianza: number;
  errores: string[];
}

/**
 * Verify extraction results using Claude Haiku (internal JD).
 */
export async function verifyExtraction(
  _extractedData: Record<string, unknown>,
  _originalText: string
): Promise<VerificationResult> {
  if (!isConfigured()) notConfiguredError();
  throw new Error("Verificacion LLM no implementada — Fase 2B");
}
