// ─────────────────────────────────────────────────────────────
// SecopDownloadClient — Download SECOP pliego PDFs
// Orchestrates: auth → process page (captcha opcional) → FileId → download
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

const CAPTCHA_CHECK_URL = `${SECOP_BASE}/Public/Common/GoogleReCaptcha/CaptchaCheck`;

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
   * Fetch the process page, solving CAPTCHA if needed, and extract FileIds.
   *
   * SECOP public pages show a Google ReCaptcha v2 BEFORE loading the
   * actual process content. This method:
   *   1. Fetches the page
   *   2. If ReCaptcha detected → solves via 2captcha → submits check → retries
   *   3. Extracts FileIds from the real page content
   */
  /* protected — for testing via vi.spyOn */
  async fetchFileIdFromProcess(
    processUrl: string,
    session: SecopSession
  ): Promise<string> {
    const html = await this.fetchWithCaptchaBypass(processUrl, session);

    // Try multiple patterns to find document FileIds
    const patterns = [
      /DownloadFile\?FileId=(\d+)/g,
      /downloadfile\?fileid=(\d+)/gi,
      /FileId=(\d+)/g,
      /fileId=(\d+)/gi,
      /data-fileid=["'](\d+)["']/g,
      /documento[^"]*fileid=(\d+)/gi,
      // Pattern for SECOP JavaScript: documentFileId=' + '123456' + '&amp;mkey=
      /documentFileId=\s*['"]\s*\+\s*['"](\d+)['"]\s*\+/gi,
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
        `URL: ${processUrl}.`
      );
    }

    const firstFileId = Array.from(fileIds)[0];
    console.log(
      `[SECOP Download] Encontrados ${fileIds.size} documentos. ` +
      `Usando FileId=${firstFileId}`
    );

    return firstFileId;
  }

  /**
   * Fetch siguiendo redirects manualmente con manejo de cookies.
   * Node.js fetch NO maneja Set-Cookie automaticamente entre redirects.
   */
  private async followRedirects(
    url: string,
    initialCookies: string,
    maxRedirects: number = 5
  ): Promise<{ html: string; cookies: string; finalUrl: string }> {
    let currentUrl = url;
    let cookieJar = initialCookies;
    let remaining = maxRedirects;

    while (remaining > 0) {
      const res = await fetch(currentUrl, {
        headers: {
          ...BROWSER_HEADERS,
          Cookie: cookieJar,
          Referer: url,
        },
        redirect: "manual", // No seguir automaticamente para capturar cookies
      });

      // Extraer cookies de la respuesta
      const newCookies = this.extractSetCookie(res.headers);
      if (newCookies.length > 0) {
        const cookieParts = [
          ...newCookies.map((c: string) => c.split(";")[0]),
          ...cookieJar.split(";").map((c: string) => c.trim()).filter(Boolean),
        ];
        cookieJar = [...new Set(cookieParts)].join("; ");
      }

      // HTTP 302 → seguir redirect
      if (res.status === 302) {
        const location = res.headers.get("Location");
        if (!location) {
          throw new Error(`SECOP redirect sin Location header`);
        }
        currentUrl = location.startsWith("http") ? location : `${SECOP_BASE}${location}`;
        remaining--;
        continue;
      }

      // No es redirect → devolver HTML
      const html = await res.text();
      return { html, cookies: cookieJar, finalUrl: currentUrl };
    }

    throw new Error(`Demasiados redirects seguidos (max ${maxRedirects})`);
  }

  /**
   * Fetch page HTML, auto-resolviendo captcha si SECOP lo presenta.
   *
   * Retorna el HTML real (post-captcha) para extraer FileIds.
   */
  private async fetchWithCaptchaBypass(
    url: string,
    session: SecopSession
  ): Promise<string> {
    // SECOP responde con 302 + Set-Cookie + redirect a captcha.
    // Node.js fetch NO maneja cookies entre redirects, asi que seguimos manualmente.
    const firstRes = await this.followRedirects(url, session.cookies);
    const firstHtml = firstRes.html;
    const firstCookies = firstRes.cookies;

    // Si NO hay captcha → devolver HTML directamente
    if (!this.isCaptchaPage(firstHtml)) {
      return firstHtml;
    }

    console.log("[SECOP Download] ReCaptcha detectado en pagina de proceso. Resolviendo...");
    console.log(`[SECOP Download] Captcha page: ${firstRes.finalUrl}`);

    // Extraer sitekey y mkey del HTML del captcha
    const siteKey = this.extractSiteKey(firstHtml);
    const mkey = this.extractMkeyFromPage(firstHtml);

    if (!siteKey || !mkey) {
      throw new Error(
        `No se pudo extraer siteKey/mkey de la pagina captcha de SECOP. ` +
        `URL: ${url}`
      );
    }

    // La URL base para el CaptchaCheck es la pagina del captcha
    const captchaPageUrl = firstRes.finalUrl;

    // Usar solver + tracker del authClient
    const solver = this.authClient.getSolver();
    const tracker = this.authClient.getTracker();

    // Verificar circuit breaker antes de gastar
    const cb = tracker.isCircuitBroken();
    if (cb.broken) {
      throw new Error(`Circuit breaker activado: ${cb.reason}`);
    }

    // Iniciar tracking del captcha de pagina de proceso
    const attempt = 0;
    const recordId = tracker.startAttempt("recaptcha_v2", attempt);
    const solveStart = Date.now();

    try {
      // Resolver captcha via 2captcha
      const captchaResult = await solver.solveIfPresent(url, firstHtml, siteKey);

      const solveDuration = Date.now() - solveStart;
      tracker.reportSolve(recordId, captchaResult.solved, solveDuration);

      if (!captchaResult.solved || !captchaResult.token) {
        tracker.reportCaptchaCheck(recordId, false);
        await tracker.persistRecord(recordId);
        throw new Error(
          `No se pudo resolver el captcha de la pagina del proceso. ` +
          `2captcha: ${captchaResult.message}`
        );
      }

      // Construir cookie jar actualizada con cookies de la pagina captcha
      const updatedCookie = [
        firstCookies,
        session.cookies,
      ].filter(Boolean).join("; ");

      // La URL del CaptchaCheck es RELATIVA al form: action="CaptchaCheck"
      // Resuelve relativo a la URL de la pagina de captcha (/Public/Common/GoogleReCaptcha/Index)
      const captchaPath = new URL(captchaPageUrl).pathname; // /Public/Common/GoogleReCaptcha/Index
      const checkPath = captchaPath.substring(0, captchaPath.lastIndexOf("/")) + "/CaptchaCheck";
      const checkUrl = `${SECOP_BASE}${checkPath}`;

      console.log(`[SECOP Download] CaptchaCheck URL: ${checkUrl}`);

      // El form ASP.NET espera txaresponseKey (donde se copia g-recaptcha-response)
      // y los hidden Post_Back_Action_Name_Hidden + Post_Back_Arguments_Hidden
      const checkBodyData = new URLSearchParams({
        txaresponseKey: captchaResult.token,
        Post_Back_Action_Name_Hidden: "",
        Post_Back_Arguments_Hidden: "",
        btnCaptchaCheckButton: "Submit",
      });

      // CaptchaCheck puede devolver 302 + Set-Cookie con bypass.
      // Usar followRedirects para capturar cualquier cookie de sesion
      let checkResult: { html: string; cookies: string };
      try {
        // POST inicial sin redirect manual
        const postRes = await fetch(checkUrl, {
          method: "POST",
          headers: {
            ...BROWSER_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: updatedCookie,
            Referer: captchaPageUrl,
          },
          body: checkBodyData,
          redirect: "manual",
        });

        if (postRes.status === 302) {
          // Seguir el redirect manualmente para capturar cookies
          const location = postRes.headers.get("Location") || "";
          const redirectUrl = location.startsWith("http") ? location : `${SECOP_BASE}${location}`;
          const checkCookiesNew = this.extractSetCookie(postRes.headers);
          const combinedCookie = [updatedCookie, ...checkCookiesNew.map((c: string) => c.split(";")[0])].filter(Boolean).join("; ");
          checkResult = await this.followRedirects(redirectUrl, combinedCookie);
        } else {
          const checkBody = await postRes.text().catch(() => "");
          const checkCookiesPost = this.extractSetCookie(postRes.headers);
          checkResult = { html: checkBody, cookies: [updatedCookie, ...checkCookiesPost.map((c: string) => c.split(";")[0])].filter(Boolean).join("; ") };
        }
      } catch (e: any) {
        checkResult = { html: "", cookies: updatedCookie };
      }

      // Verificar resultado del CaptchaCheck
      const hasError = /error|Error|ERROR/.test(checkResult.html);
      const stillCaptcha = checkResult.html.includes("ReCaptcha") || checkResult.html.includes("g-recaptcha");
      const checkOk = !hasError && !stillCaptcha;

      if (!checkOk) {
        console.log(`[SECOP Download] CaptchaCheck response (HTTP ${checkRes.status}):`);
        console.log(`  body snippet: ${checkBody.slice(0, 300)}`);
      }

      tracker.reportCaptchaCheck(recordId, checkOk);
      await tracker.persistRecord(recordId);

      if (!checkOk) {
        throw new Error(
          `CaptchaCheck fallo (HTTP ${checkRes.status}). ` +
          `El token de 2captcha pudo expirar o la URL es incorrecta.`
        );
      }

      // Construir cookie jar final con cookies del CaptchaCheck
      const finalCookie = checkResult.cookies;

      console.log("[SECOP Download] CaptchaCheck OK, re-fetching process page...");

      // Re-fetch: ahora SECOP deberia devolver el HTML real del proceso
      const secondRes = await this.followRedirects(url, finalCookie);
      const secondHtml = secondRes.html;

      // Verificar que ya no sea pagina de captcha
      if (this.isCaptchaPage(secondHtml)) {
        // Si sigue en captcha, el HTML puede ser la pagina de error/rechazo
        console.log(`[SECOP Download] Segunda respuesta HTML (${secondHtml.length} bytes, starts: ${secondHtml.slice(0, 100)})`);
        throw new Error(
          `La pagina del proceso sigue mostrando ReCaptcha tras resolverlo. ` +
          `SECOP requiere posiblemente un approach diferente para paginas publicas.`
        );
      }

      console.log("[SECOP Download] Pagina real obtenida exitosamente tras captcha.");
      return secondHtml;

    } catch (err) {
      // Asegurar que el registro se persista incluso en error
      try { await tracker.persistRecord(recordId); } catch { /* ignore */ }
      throw err;
    }
  }

  /**
   * Detecta si la respuesta HTML de SECOP es una pagina de ReCaptcha
   * (en lugar del contenido real del proceso).
   */
  private isCaptchaPage(html: string): boolean {
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";
    return title === "ReCaptcha" || html.includes('class="g-recaptcha"');
  }

  /**
   * Extrae el sitekey de Google ReCaptcha del HTML.
   */
  private extractSiteKey(html: string): string | null {
    const match = html.match(/data-sitekey=["']([^"']+)["']/);
    return match ? match[1] : null;
  }

  /**
   * Extrae el mkey (machine key) de la pagina de captcha de SECOP.
   * Patron: mkey=UUID_con_underscores (8_4_4_4_12)
   */
  private extractMkeyFromPage(html: string): string | null {
    const match = html.match(/mkey=([a-f0-9_]{36})/i);
    return match ? match[1] : null;
  }

  /**
   * Extrae Set-Cookie headers con fallback para Node <19.
   */
  private extractSetCookie(headers: Headers): string[] {
    if (typeof headers.getSetCookie === "function") {
      return headers.getSetCookie() ?? [];
    }
    const raw = headers.get("set-cookie");
    if (!raw) return [];
    return raw.split(",").map((c: string) => c.trim());
  }

  /**
   * Download a document from SECOP using a FileId.
   * Returns Buffer (may be PDF, DOCX, XLSX, etc.)
   */
  /* protected — for testing via vi.spyOn */
  async downloadFile(
    fileId: string,
    session: SecopSession
  ): Promise<Buffer> {
    // Try primary download URL first (Licitacion Publica / Concurso de Meritos)
    const downloadUrl = `${SECOP_BASE}/Public/Tendering/OpportunityDetail/DownloadFile?documentFileId=${fileId}`;

    const res = await fetch(downloadUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Cookie: session.cookies,
        Referer: SECOP_BASE + "/Public/Tendering/OpportunityDetail/",
      },
      redirect: "manual",
    });

    if (res.status === 404) {
      throw new Error(
        `HTTP 404: Documento no encontrado (FileId=${fileId})`
      );
    }

    if (res.status === 403) {
      throw new Error(
        `HTTP 403: Acceso denegado al documento (FileId=${fileId}). ` +
        `La sesion SECOP puede haber expirado.`
      );
    }

    // Handle JS redirect: <script>window.location.href = '/Public/Archive/RetrieveFile/Index?...'</script>
    const body = await res.text();
    const jsMatch = body.match(/window\.location\.href\s*=\s*'([^']+)'/);
    if (jsMatch) {
      const retrieveUrl = `${SECOP_BASE}${jsMatch[1]}`;
      console.log(`[SECOP Download] Siguiendo redirect a RetrieveFile...`);

      const retrieveRes = await fetch(retrieveUrl, {
        headers: {
          ...BROWSER_HEADERS,
          Cookie: session.cookies,
          Referer: downloadUrl,
        },
      });

      if (!retrieveRes.ok) {
        throw new Error(
          `HTTP ${retrieveRes.status}: Error en RetrieveFile (FileId=${fileId})`
        );
      }

      const buffer = Buffer.from(await retrieveRes.arrayBuffer());
      const fileName = retrieveRes.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || `${fileId}.bin`;
      console.log(
        `[SECOP Download] Documento descargado: ${fileName}, ` +
        `${(buffer.length / 1024).toFixed(0)} KB via RetrieveFile`
      );
      return buffer;
    }

    // Fallback: try Archivo/DownloadFile
    if (res.status === 302 || (res.ok && body.length < 500)) {
      const fallbackUrl = `${SECOP_BASE}/Public/Archivo/DownloadFile?FileId=${fileId}`;
      console.log(`[SECOP Download] Fallback a: ${fallbackUrl}`);
      const fallbackRes = await fetch(fallbackUrl, {
        headers: {
          ...BROWSER_HEADERS,
          Cookie: session.cookies,
          Referer: SECOP_BASE + "/Public/Tendering/OpportunityDetail/",
        },
      });
      if (fallbackRes.ok) {
        const buffer = Buffer.from(await fallbackRes.arrayBuffer());
        console.log(`[SECOP Download] Documento descargado: FileId=${fileId}, ${(buffer.length / 1024).toFixed(0)} KB`);
        return buffer;
      }
    }

    throw new Error(
      `No se pudo descargar documento FileId=${fileId} (HTTP ${res.status})`
    );
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
