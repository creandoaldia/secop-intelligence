// ──────────────────────────────────────────────────────────────────────────
// doc2md-client.ts — HTTP client for the doc2md Python microservice
// Converts SECOP PDFs to Markdown by calling the sidecar POST /convert
// ──────────────────────────────────────────────────────────────────────────

import { DOC2MD_SERVICE_URL, ANALYSIS_OCR_TIMEOUT_MS } from "@/lib/constants";
import type { OcrResult } from "./client";

// ─── Types ───────────────────────────────────────────────────────────────

interface Doc2MdMetadata {
  engine: string;
  fallback: string;
  pages: number;
  source: string;
}

interface Doc2MdResponse {
  markdown: string;
  metadata: Doc2MdMetadata;
}

interface Doc2MdError {
  error: string;
  detail?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────

/**
 * Convert a PDF from URL to Markdown via the doc2md microservice.
 *
 * Returns an OcrResult-compatible object:
 *   - content:     Markdown text
 *   - pages:       Page count from metadata
 *   - tables:      Empty array — tables are embedded in the markdown
 *                  as pipe tables (pymupdf4llm L2) or HTML tables (Azure).
 *                  See ARCHITECTURE.md for details.
 *
 * JD FIX 5: tables=[] is documented. The worker pipeline already ignores
 * the tables field — it only reads content for LLM extraction.
 */
export async function analyzeDocumentViaDoc2md(url: string): Promise<OcrResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_OCR_TIMEOUT_MS);

  try {
    const response = await fetch(`${DOC2MD_SERVICE_URL}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as Doc2MdError;
      throw new Error(
        `doc2md failed (${response.status}): ${errorBody.error ?? response.statusText}`,
      );
    }

    const data = (await response.json()) as Doc2MdResponse;

    return {
      content: data.markdown,
      pages: data.metadata.pages,
      tables: [], // FIX 5: tables embedded in markdown content
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `doc2md timeout after ${ANALYSIS_OCR_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
