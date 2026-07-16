// ─────────────────────────────────────────────────────────────
// SecopDownloadClient — Download SECOP pliego PDFs
// Orchestrates: auth → process page → FileId → download
// ─────────────────────────────────────────────────────────────

import { writeFileSync, mkdtempSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SecopAuthClient, SecopSession } from "./auth";

const SECOP_BASE = "https://community.secop.gov.co";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "es-CO,es;q=0.9,en;q=0.7",
};

export class SecopDownloadClient {
  private authClient: SecopAuthClient;

  constructor(authClient?: SecopAuthClient) {
    this.authClient = authClient ?? new SecopAuthClient();
  }

  async init(): Promise<void> {
    await this.authClient.init();
  }

  /**
   * Get the pliego PDF for a SECOP process.
   *
   * @param procesoId - The SECOP process ID (e.g., CO1.REQ.1234567)
   * @param processUrl - The SECOP process page URL (urlSecop from DB)
   * @returns Buffer with the PDF content
   */
  async getPliegoPdf(
    procesoId: string,
    processUrl: string
  ): Promise<Buffer> {
    // 1. Ensure we have a valid session
    const session = await this.authClient.getValidSession();

    // 2. Get FileId from the process page
    const fileId = await this.fetchFileIdFromProcess(processUrl, session);

    // 3. Download the PDF using the FileId
    return this.downloadFile(fileId, session);
  }

  /**
   * Download a PDF directly by FileId.
   */
  async downloadByFileId(fileId: string): Promise<Buffer> {
    const session = await this.authClient.getValidSession();
    return this.downloadFile(fileId, session);
  }

  // ─── Internal (overridable for testing) ────────────────────

  /**
   * Fetch the process page and extract document FileIds.
   */
  /* protected — for testing via vi.spyOn */
  async fetchFileIdFromProcess(
    processUrl: string,
    session: SecopSession
  ): Promise<string> {
    const res = await fetch(processUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Cookie: session.cookies,
        Referer: SECOP_BASE + "/",
      },
    });

    const html = await res.text();

    // Try multiple patterns to find document FileIds
    const patterns = [
      /DownloadFile\?FileId=(\d+)/g,
      /downloadfile\?fileid=(\d+)/gi,
      /FileId=(\d+)/g,
      /fileId=(\d+)/gi,
      /data-fileid=["'](\d+)["']/g,
      /documento[^"]*fileid=(\d+)/gi,
    ];

    const fileIds = new Set<string>();

    for (const pattern of patterns) {
      const matches = Array.from(html.matchAll(pattern));
      for (const match of matches) {
        fileIds.add(match[1]);
      }
    }

    if (fileIds.size === 0) {
      throw new Error(
        `No se encontraron documentos en la pagina del proceso. ` +
        `URL: ${processUrl}. Posible causa: CAPTCHA bloqueando la pagina.`
      );
    }

    // Return the first FileId (usually the main pliego)
    // In the future, we could return all FileIds and let the caller choose
    const firstFileId = Array.from(fileIds)[0];
    console.log(
      `[SECOP Download] Encontrados ${fileIds.size} documentos. ` +
      `Usando FileId=${firstFileId}`
    );

    return firstFileId;
  }

  /**
   * Download a PDF from SECOP using a FileId.
   */
  /* protected — for testing via vi.spyOn */
  async downloadFile(
    fileId: string,
    session: SecopSession
  ): Promise<Buffer> {
    const downloadUrl = `${SECOP_BASE}/Public/Archivo/DownloadFile?FileId=${fileId}`;

    const res = await fetch(downloadUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Cookie: session.cookies,
        Referer: SECOP_BASE + "/Public/Tendering/OpportunityDetail/",
      },
    });

    if (res.status === 404) {
      throw new Error(
        `HTTP 404: Documento no encontrado (FileId=${fileId}). ` +
        `Puede haber expirado o el FileId es incorrecto.`
      );
    }

    if (res.status === 403) {
      throw new Error(
        `HTTP 403: Acceso denegado al documento (FileId=${fileId}). ` +
        `La sesion SECOP puede haber expirado. Reintentando login...`
      );
    }

    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status}: Error descargando documento (FileId=${fileId})`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    if (pdfBuffer.length < 100 || !pdfBuffer.toString().startsWith("%PDF")) {
      throw new Error(
        `El archivo descargado (FileId=${fileId}, ${pdfBuffer.length} bytes) ` +
        `no parece ser un PDF valido.`
      );
    }

    console.log(
      `[SECOP Download] PDF descargado: FileId=${fileId}, ` +
      `${(pdfBuffer.length / 1024).toFixed(0)} KB`
    );

    return pdfBuffer;
  }

  /**
   * Ensure a valid session exists (used internally).
   */
  /* protected — for testing via vi.spyOn */
  async ensureSession(): Promise<{ cookies: string; expiresAt: Date }> {
    const session = await this.authClient.getValidSession();
    return {
      cookies: session.cookies,
      expiresAt: session.expiresAt,
    };
  }
}

// ─── Convenience function: download pliego to temp file ────

let _downloadClient: SecopDownloadClient | null = null;

/**
 * Download a SECOP pliego PDF to a temporary file and return its path.
 * Used by the analysis worker when urlPliego is NULL.
 *
 * @param procesoId - SECOP process ID
 * @param processUrl - SECOP process page URL (urlSecop from DB)
 * @returns Path to the downloaded PDF temp file
 */
export async function downloadPliegoToTemp(
  procesoId: string,
  processUrl: string
): Promise<string> {
  if (!_downloadClient) {
    _downloadClient = new SecopDownloadClient();
    await _downloadClient.init();
  }

  const pdfBuffer = await _downloadClient.getPliegoPdf(procesoId, processUrl);

  const tmpDir = mkdtempSync(join(tmpdir(), "secop-pliego-"));
  const tmpPath = join(tmpDir, `${procesoId.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);

  writeFileSync(tmpPath, pdfBuffer);

  // Auto-cleanup on process exit
  process.once("exit", () => {
    try {
      unlinkSync(tmpPath);
    } catch { /* ignore */ }
  });

  return tmpPath;
}
