// ─────────────────────────────────────────────────────────────
// CaptchaSolver — 2captcha integration for SECOP ReCaptcha
// Two modes:
//   auto:  Uses 2captcha API (requires CAPTCHA_SOLVER_API_KEY)
//   manual: Logs warning, returns unsolved (for dev/fallback)
// ─────────────────────────────────────────────────────────────

const CAPTCHA_SOLVER_API_KEY = process.env.CAPTCHA_SOLVER_API_KEY ?? "";
const TWOCAPTCHA_BASE = "https://2captcha.com";

export interface CaptchaResult {
  solved: boolean;
  token?: string;
  method: "auto" | "manual";
  message: string;
}

export class CaptchaSolver {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? CAPTCHA_SOLVER_API_KEY;
  }

  /**
   * Check if the page HTML contains a ReCaptcha challenge.
   * If yes and API key is configured, solve it via 2captcha.
   * If no API key, return unsolved with manual instructions.
   */
  async solveIfPresent(
    pageUrl: string,
    pageHtml: string,
    siteKey?: string
  ): Promise<CaptchaResult> {
    const hasCaptcha =
      pageHtml.includes("recaptcha") ||
      pageHtml.includes("g-recaptcha") ||
      pageHtml.includes("ReCaptcha") ||
      pageHtml.includes("cf-turnstile");

    if (!hasCaptcha) {
      return { solved: false, method: "manual", message: "No CAPTCHA detected" };
    }

    // Manual mode: no API key configured
    if (!this.apiKey) {
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

    // Auto mode: use 2captcha
    const resolvedSiteKey = siteKey ?? this.extractSiteKey(pageHtml);

    if (!resolvedSiteKey) {
      throw new Error(
        "CAPTCHA detectado pero no se pudo extraer el sitekey. " +
        "Proporciona el sitekey manualmente."
      );
    }

    return this.solveWith2Captcha(pageUrl, resolvedSiteKey);
  }

  /**
   * Solve ReCaptcha v2 via 2captcha API.
   */
  private async solveWith2Captcha(
    pageUrl: string,
    siteKey: string
  ): Promise<CaptchaResult> {
    // Step 1: Submit captcha to 2captcha
    const inUrl = `${TWOCAPTCHA_BASE}/in.php?key=${this.apiKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;

    const inRes = await fetch(inUrl);
    const inData = await inRes.json() as Record<string, unknown>;

    if (inData.status !== 1) {
      throw new Error(`2captcha submit failed: ${JSON.stringify(inData)}`);
    }

    const captchaId = inData.request as string;

    // Step 2: Poll for result (up to 120 seconds)
    const pollUrl = `${TWOCAPTCHA_BASE}/res.php?key=${this.apiKey}&action=get&id=${captchaId}&json=1`;
    const maxAttempts = 60;
    const pollIntervalMs = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const pollRes = await fetch(pollUrl);
      const pollData = await pollRes.json() as Record<string, unknown>;

      if (pollData.status === 1) {
        return {
          solved: true,
          token: pollData.request as string,
          method: "auto",
          message: "CAPTCHA resuelto via 2captcha",
        };
      }

      if (pollData.request === "ERROR_CAPTCHA_UNSOLVABLE") {
        throw new Error("2captcha: CAPTCHA unsolvable");
      }
    }

    throw new Error("2captcha: timeout waiting for solution");
  }

  /**
   * Extract ReCaptcha sitekey from HTML.
   */
  private extractSiteKey(html: string): string | null {
    // Common patterns for ReCaptcha sitekey
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
}
