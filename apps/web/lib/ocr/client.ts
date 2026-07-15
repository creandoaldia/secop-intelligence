// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Azure Document Intelligence Wrapper
// All functions throw "No configurado" when API keys are missing
// ─────────────────────────────────────────────────────────────

const AZURE_OCR_ENDPOINT = process.env.AZURE_OCR_ENDPOINT;
const AZURE_OCR_KEY = process.env.AZURE_OCR_KEY;

function isConfigured(): boolean {
  return !!(AZURE_OCR_ENDPOINT && AZURE_OCR_KEY);
}

function notConfiguredError(): never {
  throw new Error(
    "Azure Document Intelligence no configurado. Define AZURE_OCR_ENDPOINT y AZURE_OCR_KEY en .env"
  );
}

export interface OcrResult {
  pages: number;
  content: string;
  tables: Array<Record<string, string>>;
}

/**
 * Analyze a document from a URL (pliego PDF).
 */
export async function analyzeDocumentFromUrl(_url: string): Promise<OcrResult> {
  if (!isConfigured()) notConfiguredError();
  throw new Error("Azure OCR no implementado — Fase 2B");
}

/**
 * Analyze a document from a local buffer.
 */
export async function analyzeDocumentFromBuffer(_buffer: Buffer): Promise<OcrResult> {
  if (!isConfigured()) notConfiguredError();
  throw new Error("Azure OCR no implementado — Fase 2B");
}
