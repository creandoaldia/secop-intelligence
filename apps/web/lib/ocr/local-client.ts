// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Local Tesseract OCR Client
// Fallback when Azure OCR no esta configurado
// TEMPORAL: reemplazar con Azure/premium cuando haya PMF
// ─────────────────────────────────────────────────────────────

import { execSync } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ─── Config ────────────────────────────────────────────────

const TESSERACT_PATH = process.env.TESSERACT_PATH || "tesseract";
const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".pnm", ".webp"];
const TESSERACT_TIMEOUT_MS = 120_000; // 2 min

// ─── Types ─────────────────────────────────────────────────

export interface OcrResult {
  pages: number;
  content: string;
  tables: Array<Record<string, string>>;
}

// ─── Helpers ───────────────────────────────────────────────

function getExtension(urlOrPath: string): string {
  const clean = urlOrPath.split("?")[0].split("#")[0];
  const match = clean.match(/\.(\w+)$/);
  return match ? `.${match[1].toLowerCase()}` : "";
}

function isImage(path: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(getExtension(path));
}

function isPdf(path: string): boolean {
  return getExtension(path) === ".pdf";
}

// ─── Download ──────────────────────────────────────────────

async function downloadToTemp(url: string, tmpDir: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Detect extension from Content-Type or URL
  const contentType = response.headers.get("content-type") || "";
  let ext = getExtension(url);

  if (!ext || ext === ".aspx" || ext === ".php") {
    if (contentType.includes("pdf")) ext = ".pdf";
    else if (contentType.includes("png")) ext = ".png";
    else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = ".jpg";
    else if (contentType.includes("tiff")) ext = ".tiff";
    else ext = ".bin"; // unknown
  }

  const filePath = join(tmpDir, `document${ext}`);
  writeFileSync(filePath, buffer);
  return filePath;
}

// ─── Tesseract Execution ───────────────────────────────────

function runTesseract(imagePath: string, tmpDir: string): string {
  const outputBase = join(tmpDir, "ocr-output");

  execSync(
    `"${TESSERACT_PATH}" "${imagePath}" "${outputBase}" --psm 3 -l eng`,
    { timeout: TESSERACT_TIMEOUT_MS, encoding: "utf8" }
  );

  const outputFile = `${outputBase}.txt`;
  const text = readFileSync(outputFile, "utf8");
  return text;
}

// ─── Main OCR ──────────────────────────────────────────────

export async function analyzeDocumentFromUrl(url: string): Promise<OcrResult> {
  const tmpDir = mkdtempSync(join(tmpdir(), "secop-ocr-"));
  let filePath = "";

  try {
    filePath = await downloadToTemp(url, tmpDir);

    if (isPdf(filePath)) {
      throw new Error(
        "OCR LOCAL: PDF no soportado directamente. Opciones:\n" +
        "1. Usa Azure OCR (configurando AZURE_OCR_ENDPOINT + AZURE_OCR_KEY)\n" +
        "2. Convierte el PDF a imagenes manualmente con herramientas como poppler (pdftoppm)\n" +
        "3. Usa ChatGPT browser para leer el documento y pegar el texto"
      );
    }

    if (!isImage(filePath)) {
      throw new Error(
        `OCR LOCAL: Formato no soportado: ${getExtension(filePath)}. ` +
        `Formatos soportados: ${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}`
      );
    }

    const content = runTesseract(filePath, tmpDir);

    return {
      pages: 1,
      content: content.trim() || "(sin texto extraido)",
      tables: [],
    };
  } finally {
    // Cleanup temp files
    try {
      if (filePath) unlinkSync(filePath);
      // Cleanup output file if it exists
      const outputFile = join(tmpDir, "ocr-output.txt");
      try { unlinkSync(outputFile); } catch { /* ignore */ }
      try { unlinkSync(join(tmpDir, "ocr-output.ttf")); } catch { /* ignore */ }
      try { unlinkSync(join(tmpDir, "ocr-output.box")); } catch { /* ignore */ }
      try { unlinkSync(join(tmpDir, "ocr-output.unlv")); } catch { /* ignore */ }
      // Cleanup the temp directory (Node 14+ has recursive option)
      try { execSync(`rmdir /s /q "${tmpDir}"`, { timeout: 5_000 }); } catch { /* ignore */ }
    } catch { /* cleanup errors are non-fatal */ }
  }
}

// ─── Multi-page support placeholder ────────────────────────

export async function analyzeDocumentFromBuffer(buffer: Buffer, filename?: string): Promise<OcrResult> {
  const tmpDir = mkdtempSync(join(tmpdir(), "secop-ocr-"));
  const ext = filename ? getExtension(filename) : ".png";
  const filePath = join(tmpDir, `document${ext}`);

  try {
    writeFileSync(filePath, buffer);

    if (isPdf(filePath)) {
      throw new Error(
        "OCR LOCAL: PDF no soportado. Convierte a imagenes primero."
      );
    }

    if (!isImage(filePath)) {
      throw new Error(
        `OCR LOCAL: Formato no soportado: ${ext}. ` +
        `Formatos soportados: ${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}`
      );
    }

    const content = runTesseract(filePath, tmpDir);

    return {
      pages: 1,
      content: content.trim() || "(sin texto extraido)",
      tables: [],
    };
  } finally {
    try {
      if (filePath) unlinkSync(filePath);
      try { unlinkSync(join(tmpDir, "ocr-output.txt")); } catch { /* ignore */ }
      try { execSync(`rmdir /s /q "${tmpDir}"`, { timeout: 5_000 }); } catch { /* ignore */ }
    } catch { /* ignore */ }
  }
}
