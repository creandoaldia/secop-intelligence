// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — OCR Client (Azure + Local fallback)
// TEMPORAL: Azure por defecto, cae a Tesseract local si no hay keys
// ─────────────────────────────────────────────────────────────

import { z } from "zod";

// ─── Config ────────────────────────────────────────────────

const AZURE_OCR_ENDPOINT = process.env.AZURE_OCR_ENDPOINT;
const AZURE_OCR_KEY = process.env.AZURE_OCR_KEY;

function isAzureConfigured(): boolean {
  return !!(AZURE_OCR_ENDPOINT && AZURE_OCR_KEY);
}

function notConfiguredError(): never {
  throw new Error(
    "Azure Document Intelligence no configurado. Define AZURE_OCR_ENDPOINT y AZURE_OCR_KEY en .env"
  );
}

// ─── Types ─────────────────────────────────────────────────

export interface OcrResult {
  pages: number;
  content: string;
  tables: Array<Record<string, string>>;
}

// ─── Constants ─────────────────────────────────────────────

const API_VERSION = "2023-10-31-preview";
const TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const POLL_INTERVAL_MS = 2_000; // 2 sec between polls

// ─── HTTP Helpers ──────────────────────────────────────────

function buildUrl(path: string): string {
  const base = AZURE_OCR_ENDPOINT!.replace(/\/+$/, "");
  return `${base}/documentintelligence/${path}?api-version=${API_VERSION}`;
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "Ocp-Apim-Subscription-Key": AZURE_OCR_KEY!,
      },
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Analyze from URL ──────────────────────────────────────

const ocrResponseSchema = z.object({
  pages: z.array(z.unknown()).optional(),
  tables: z.array(z.unknown()).optional(),
  content: z.string().optional(),
  paragraphs: z.array(z.object({
    content: z.string(),
    role: z.string().optional(),
  })).optional(),
});

export async function analyzeDocumentFromUrlAzure(url: string): Promise<OcrResult> {
  if (!isAzureConfigured()) notConfiguredError();

  // Step 1: Start analysis
  const startUrl = buildUrl("documentModels/prebuilt-layout:analyze");
  const startResponse = await fetchWithAuth(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urlSource: url }),
  });

  if (!startResponse.ok) {
    const errorBody = await startResponse.text().catch(() => "unknown");
    throw new Error(`Azure OCR start failed (${startResponse.status}): ${errorBody.slice(0, 500)}`);
  }

  // Step 2: Extract operation-location header
  const operationLocation = startResponse.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("Azure OCR: no operation-location header in response");
  }

  // Step 3: Poll for completion
  let result: Record<string, unknown> | null = null;
  const startTime = Date.now();

  while (Date.now() - startTime < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollResponse = await fetchWithAuth(operationLocation);
    if (!pollResponse.ok) continue;

    const pollData = await pollResponse.json() as Record<string, unknown>;
    const status = pollData.status as string;

    if (status === "succeeded") {
      result = (pollData.analyzeResult ?? pollData.result) as Record<string, unknown>;
      break;
    }

    if (status === "failed") {
      const errorInfo = (pollData.error as { message?: string }) ?? {};
      throw new Error(`Azure OCR failed: ${errorInfo.message ?? JSON.stringify(pollData.error)}`);
    }

    // "running" or "notStarted" — continue polling
  }

  if (!result) {
    throw new Error(`Azure OCR timeout after ${TIMEOUT_MS}ms`);
  }

  // Step 4: Parse result
  const parsed = ocrResponseSchema.parse(result);

  // Extract content
  let content = parsed.content ?? "";
  if (!content && parsed.paragraphs) {
    content = parsed.paragraphs
      .filter((p) => p.role !== "pageHeader" && p.role !== "pageFooter" && p.role !== "pageNumber")
      .map((p) => p.content)
      .join("\n\n");
  }

  // Extract tables
  const tables: Array<Record<string, string>> = [];
  if (parsed.tables) {
    for (const table of parsed.tables as Array<{
      cells?: Array<{ content?: string; rowIndex?: number; columnIndex?: number }>;
    }>) {
      if (!table.cells) continue;
      const maxRow = Math.max(...table.cells.map((c) => c.rowIndex ?? 0));
      const headers = table.cells
        .filter((c) => c.rowIndex === 0)
        .map((c) => c.content ?? "");
      if (headers.length === 0) continue;

      for (let r = 1; r <= maxRow; r++) {
        const row: Record<string, string> = {};
        const rowCells = table.cells.filter((c) => c.rowIndex === r);
        for (let c = 0; c < headers.length && c < rowCells.length; c++) {
          row[headers[c]] = rowCells[c]?.content ?? "";
        }
        if (Object.keys(row).length > 0) tables.push(row);
      }
    }
  }

  return {
    pages: parsed.pages?.length ?? 0,
    content: content || "(sin contenido extraido)",
    tables,
  };
}

// ─── Smart Export: Azure first, local Tesseract fallback ────

import { analyzeDocumentFromUrl as localOcrUrl, analyzeDocumentFromBuffer as localOcrBuffer } from "./local-client";

export async function analyzeDocumentFromUrl(url: string): Promise<OcrResult> {
  if (isAzureConfigured()) {
    return analyzeDocumentFromUrlAzure(url);
  }
  console.log("[OCR] Azure no configurado, usando OCR local (Tesseract)");
  return localOcrUrl(url);
}

export async function analyzeDocumentFromBuffer(buffer: Buffer, filename?: string): Promise<OcrResult> {
  if (isAzureConfigured()) {
    return analyzeDocumentFromBufferAzure(buffer);
  }
  console.log("[OCR] Azure no configurado, usando OCR local (Tesseract)");
  return localOcrBuffer(buffer, filename);
}

// ─── Analyze from Buffer ───────────────────────────────────

export async function analyzeDocumentFromBufferAzure(buffer: Buffer): Promise<OcrResult> {
  if (!isAzureConfigured()) notConfiguredError();

  // Step 1: Start analysis
  const startUrl = buildUrl("documentModels/prebuilt-layout:analyze");
  const startResponse = await fetchWithAuth(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(buffer),
  });

  if (!startResponse.ok) {
    const errorBody = await startResponse.text().catch(() => "unknown");
    throw new Error(`Azure OCR start failed (${startResponse.status}): ${errorBody.slice(0, 500)}`);
  }

  const operationLocation = startResponse.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("Azure OCR: no operation-location header in response");
  }

  // Step 2: Poll for completion
  let result: Record<string, unknown> | null = null;
  const startTime = Date.now();

  while (Date.now() - startTime < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollResponse = await fetchWithAuth(operationLocation);
    if (!pollResponse.ok) continue;

    const pollData = await pollResponse.json() as Record<string, unknown>;
    const status = pollData.status as string;

    if (status === "succeeded") {
      result = (pollData.analyzeResult ?? pollData.result) as Record<string, unknown>;
      break;
    }

    if (status === "failed") {
      const errorInfo = (pollData.error as { message?: string }) ?? {};
      throw new Error(`Azure OCR failed: ${errorInfo.message ?? JSON.stringify(pollData.error)}`);
    }
  }

  if (!result) {
    throw new Error(`Azure OCR timeout after ${TIMEOUT_MS}ms`);
  }

  const parsed = ocrResponseSchema.parse(result);

  let content = parsed.content ?? "";
  if (!content && parsed.paragraphs) {
    content = parsed.paragraphs
      .filter((p) => p.role !== "pageHeader" && p.role !== "pageFooter" && p.role !== "pageNumber")
      .map((p) => p.content)
      .join("\n\n");
  }

  const tables: Array<Record<string, string>> = [];
  if (parsed.tables) {
    for (const table of parsed.tables as Array<{
      cells?: Array<{ content?: string; rowIndex?: number; columnIndex?: number }>;
    }>) {
      if (!table.cells) continue;
      const maxRow = Math.max(...table.cells.map((c) => c.rowIndex ?? 0));
      const headers = table.cells
        .filter((c) => c.rowIndex === 0)
        .map((c) => c.content ?? "");
      if (headers.length === 0) continue;

      for (let r = 1; r <= maxRow; r++) {
        const row: Record<string, string> = {};
        const rowCells = table.cells.filter((c) => c.rowIndex === r);
        for (let c = 0; c < headers.length && c < rowCells.length; c++) {
          row[headers[c]] = rowCells[c]?.content ?? "";
        }
        if (Object.keys(row).length > 0) tables.push(row);
      }
    }
  }

  return {
    pages: parsed.pages?.length ?? 0,
    content: content || "(sin contenido extraido)",
    tables,
  };
}
