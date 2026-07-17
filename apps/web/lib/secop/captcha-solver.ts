// ─────────────────────────────────────────────────────────────
// CaptchaSolver — 2captcha integration for SECOP
// Two captcha types:
//   1. Google ReCaptcha v2 (checkbox) — method=userrecaptcha
//   2. Custom VORTAL image captcha  — method=base64
// Fallback: manual mode (cache session cookie)
// ─────────────────────────────────────────────────────────────

const CAPTCHA_SOLVER_API_KEY = process.env.CAPTCHA_SOLVER_API_KEY ?? "";
const TWOCAPTCHA_BASE = "https://2captcha.com";
const FETCH_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 60;
const TOKEN_MAX_AGE_MS = 90_000; // 90s — 2captcha tokens expire ~120s

export interface CaptchaResult {
  solved: boolean;
  token?: string;
  method: "auto" | "manual";
  message: string;
  /** Timestamp when the solve started (for expiry tracking) */
  solvedAt?: number;
}

export class CaptchaSolver {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? CAPTCHA_SOLVER_API_KEY;
  }

  /**
   * Check the page HTML for captcha challenges in priority order:
   * 1. Google ReCaptcha v2 (g-recaptcha)
   * 2. Custom image captcha (id="imgCaptcha" / captchaElement)
   * Only ONE captcha is solved per call to avoid waste.
   */
  async solveIfPresent(
    pageUrl: string,
    pageHtml: string,
    siteKey?: string
  ): Promise<CaptchaResult> {
    // No API key → manual mode
    if (!this.apiKey) {
      const detected = this.detectAnyCaptcha(pageHtml);
      if (!detected) {
        return { solved: false, method: "manual", message: "No CAPTCHA detected" };
      }
      return {
        solved: false,
        method: "manual",
        message:
          "CAPTCHA detectado en SECOP. Para resolver automaticamente, " +
          "configura CAPTCHA_SOLVER_API_KEY en .env.enc " +
          "(https://2captcha.com). Mientras tanto, abre la pagina en " +
          "un browser, resuelve el CAPTCHA manualmente, y la cookie " +
          "de sesion se cacheara para proximas requests.",
      };
    }

    // Priority 1: Google ReCaptcha v2
    const resolvedSiteKey = siteKey ?? this.extractSiteKey(pageHtml);
    if (resolvedSiteKey) {
      console.log("[captcha] ReCaptcha v2 detected, solving...");
      return this.solveWith2Captcha(pageUrl, resolvedSiteKey);
    }

    // Priority 2: Custom image captcha (VORTAL SECOP)
    const imageUrl = this.extractImageCaptchaUrl(pageHtml, pageUrl);
    if (imageUrl) {
      console.log("[captcha] Image captcha detected, solving...");
      return this.solveImageCaptcha(imageUrl);
    }

    // No captcha detected
    return { solved: false, method: "manual", message: "No CAPTCHA detected" };
  }

  // ─── Public helpers for auth.ts ─────────────────────────────

  /** Check if the token is still fresh enough to use. */
  isTokenExpired(solvedAt: number): boolean {
    return Date.now() - solvedAt > TOKEN_MAX_AGE_MS;
  }

  // ─── Detection ──────────────────────────────────────────────

  private detectAnyCaptcha(html: string): boolean {
    return (
      html.includes("g-recaptcha") ||
      html.includes("recaptcha") ||
      html.includes("ReCaptcha") ||
      html.includes("cf-turnstile") ||
      html.includes('id="imgCaptcha"') ||
      html.includes('id="imgimgCaptcha"') ||
      html.includes('class="captchaElement"')
    );
  }

  /** Extract ReCaptcha sitekey from HTML. */
  private extractSiteKey(html: string): string | null {
    const patterns = [
      /data-sitekey=["']([^"']+)["']/,
      /recaptcha\/api\.js\?render=([^"'\s&]+)/,
      /g-recaptcha[^>]+data-sitekey=["']([^"']+)["']/,
      /cf-turnstile[^>]+sitekey=["']([^"']+)["']/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /** Extract the image captcha URL from SECOP's custom captcha. */
  private extractImageCaptchaUrl(html: string, pageUrl: string): string | null {
    // Match: id="imgCaptcha" OR id="imgimgCaptcha" (SECOP uses imgimgCaptcha)
    const match = html.match(/<img[^>]+id="img(?:img)?[Cc]aptcha"[^>]+src="([^"]+)"/);
    if (!match) return null;
    try {
      return new URL(match[1], pageUrl).href;
    } catch {
      return null;
    }
  }

  /** Check if the HTML has a custom image captcha element. */
  private hasImageCaptcha(html: string): boolean {
    return (
      html.includes('id="imgCaptcha"') ||
      html.includes('id="imgimgCaptcha"') ||
      html.includes('class="captchaElement"')
    );
  }

  // ─── ReCaptcha v2 (method=userrecaptcha) ───────────────────

  private async solveWith2Captcha(
    pageUrl: string,
    siteKey: string
  ): Promise<CaptchaResult> {
    const solveStart = Date.now();

    // Submit captcha to 2captcha
    const inUrl = `${TWOCAPTCHA_BASE}/in.php?key=${this.apiKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;

    const inRes = await fetchWithTimeout(inUrl, FETCH_TIMEOUT_MS);
    const inData = await inRes.json() as Record<string, unknown>;

    if (inData.status !== 1) {
      throw new Error(`2captcha submit failed: ${JSON.stringify(inData)}`);
    }

    const captchaId = inData.request as string;
    const pollUrl = `${TWOCAPTCHA_BASE}/res.php?key=${this.apiKey}&action=get&id=${captchaId}&json=1`;

    // Poll for result
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_MS);

      const pollRes = await fetchWithTimeout(pollUrl, FETCH_TIMEOUT_MS);
      const pollData = await pollRes.json() as Record<string, unknown>;

      if (pollData.status === 1) {
        const solvedAt = Date.now();
        console.log(`[captcha] solved (type=recaptcha, time=${((solvedAt - solveStart) / 1000).toFixed(1)}s)`);
        return {
          solved: true,
          token: pollData.request as string,
          method: "auto",
          message: "ReCaptcha v2 resuelto via 2captcha",
          solvedAt,
        };
      }

      if (pollData.request === "ERROR_CAPTCHA_UNSOLVABLE") {
        throw new Error("2captcha: ReCaptcha unsolvable");
      }
    }

    throw new Error("2captcha: timeout waiting for ReCaptcha solution");
  }

  // ─── Image Captcha (method=base64) ──────────────────────────

  private async solveImageCaptcha(
    imageUrl: string
  ): Promise<CaptchaResult> {
    const solveStart = Date.now();

    // Download the captcha image
    const imgRes = await fetchWithTimeout(imageUrl, FETCH_TIMEOUT_MS);
    if (!imgRes.ok) {
      throw new Error(`Image captcha download failed: HTTP ${imgRes.status}`);
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const base64 = imgBuffer.toString("base64");

    // Submit to 2captcha with method=base64
    const inUrl = `${TWOCAPTCHA_BASE}/in.php?key=${this.apiKey}&method=base64&body=${encodeURIComponent(base64)}&json=1`;

    const inRes = await fetchWithTimeout(inUrl, FETCH_TIMEOUT_MS);
    const inData = await inRes.json() as Record<string, unknown>;

    if (inData.status !== 1) {
      throw new Error(`2captcha image submit failed: ${JSON.stringify(inData)}`);
    }

    const captchaId = inData.request as string;
    const pollUrl = `${TWOCAPTCHA_BASE}/res.php?key=${this.apiKey}&action=get&id=${captchaId}&json=1`;

    // Poll for result
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_MS);

      const pollRes = await fetchWithTimeout(pollUrl, FETCH_TIMEOUT_MS);
      const pollData = await pollRes.json() as Record<string, unknown>;

      if (pollData.status === 1) {
        const solvedAt = Date.now();
        console.log(`[captcha] solved (type=image, time=${((solvedAt - solveStart) / 1000).toFixed(1)}s)`);
        return {
          solved: true,
          token: pollData.request as string,
          method: "auto",
          message: "Imagen captcha resuelta via 2captcha",
          solvedAt,
        };
      }

      if (pollData.request === "ERROR_CAPTCHA_UNSOLVABLE") {
        throw new Error("2captcha: image captcha unsolvable");
      }
    }

    throw new Error("2captcha: timeout waiting for image captcha solution");
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** fetch() with AbortController timeout. */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
