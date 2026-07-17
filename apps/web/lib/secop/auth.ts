// ─────────────────────────────────────────────────────────────
// SecopAuthClient — SECOP II login + session management
// Handles authentication to community.secop.gov.co,
// cookie caching via CookieStore, and session refresh.
//
// Flujo real de login (confirmado del HTML):
// 1. GET /STS/Users/Login/Index → sesion cookie + mkey + sitekey
// 2. Si hay ReCaptcha: 2captcha → token → CaptchaCheck (GET)
// 3. POST /LoginAuthenticate?mkey=... → 302 + auth cookies
// ─────────────────────────────────────────────────────────────

import { CookieStore, StoredCookie } from "./cookie-store";
import { CaptchaSolver } from "./captcha-solver";
import { CaptchaTracker } from "./captcha-tracker";
import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";

// ─── Types ──────────────────────────────────────────────────

export interface SecopSession {
  cookies: string;
  expiresAt: Date;
}

interface LoginResponse {
  success: boolean;
  cookies: string;
  sessionExpiresAt: Date;
}

// ─── Constants ──────────────────────────────────────────────

const SECOP_BASE = "https://community.secop.gov.co";
const SECOP_LOGIN_URL = `${SECOP_BASE}/STS/Users/Login/Index`;
const SECOP_COOKIE_KEY = "secop-session";
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 min (conservative)
const MAX_LOGIN_RETRIES = 3;
const RETRY_DELAYS_MS = [1_000, 3_000]; // backoff: 1s, 3s (3er intento sin delay extra)

// ─── Browser headers ────────────────────────────────────────

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-CO,es;q=0.9",
};

// ─── Auth Client ────────────────────────────────────────────

export class SecopAuthClient {
  private cookieStore: CookieStore;
  private captchaSolver: CaptchaSolver;
  private tracker: CaptchaTracker;
  private cachedSession: SecopSession | null = null;

  constructor(cookieStore?: CookieStore, captchaSolver?: CaptchaSolver, tracker?: CaptchaTracker) {
    this.cookieStore = cookieStore ?? new CookieStore();
    this.captchaSolver = captchaSolver ?? new CaptchaSolver();
    this.tracker = tracker ?? new CaptchaTracker();
  }

  /** Expose tracker for external reads (summary, stats). */
  getTracker(): CaptchaTracker {
    return this.tracker;
  }

  /**
   * Initialize the cookie store (must be called before use).
   */
  async init(): Promise<void> {
    await this.cookieStore.init();
    await this.tracker.loadHistory();
  }

  /**
   * Get a valid session — from cache, from CookieStore, or by logging in.
   */
  async getValidSession(): Promise<SecopSession> {
    // 1. Check in-memory cache
    if (this.cachedSession && this.cachedSession.expiresAt > new Date()) {
      return this.cachedSession;
    }

    // 2. Check persistent cookie store
    const stored = await this.cookieStore.load(SECOP_COOKIE_KEY);
    if (stored) {
      this.cachedSession = {
        cookies: stored.cookieValue,
        expiresAt: stored.expiresAt,
      };
      return this.cachedSession;
    }

    // 3. Login fresh
    return this.login();
  }

  /**
   * Login to SECOP with bot credentials from env vars.
   * Includes retry logic with captcha re-solve on failure.
   */
  async login(): Promise<SecopSession> {
    const username = process.env.SECOP_BOT_USERNAME;
    const password = process.env.SECOP_BOT_PASSWORD;

    if (!username || !password) {
      throw new Error(
        "SECOP_BOT_USERNAME y SECOP_BOT_PASSWORD deben estar configurados " +
        "en .env.enc (via secret-injector.ps1 set SECOP_BOT_USERNAME=...)"
      );
    }

    // Check circuit breaker before attempting
    const cb = this.tracker.isCircuitBroken();
    if (cb.broken) {
      console.warn(`[CaptchaTracker] ${cb.reason}`);
      console.log(this.tracker.getSummary());
      throw new Error(`Circuit breaker activado: ${cb.reason}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_LOGIN_RETRIES; attempt++) {
      try {
        const loginResult = await this.doLoginRequest(username, password, attempt);

        if (!loginResult.success) {
          throw new Error("SECOP login returned success=false");
        }

        // Cache in memory
        this.cachedSession = {
          cookies: loginResult.cookies,
          expiresAt: loginResult.sessionExpiresAt,
        };

        // Persist to CookieStore
        await this.cookieStore.save(
          SECOP_COOKIE_KEY,
          loginResult.cookies,
          loginResult.sessionExpiresAt
        );

        // Log successful SECOP session
        const cookieHash = this.simpleHash(loginResult.cookies);
        await db.insert(activityLog).values({
          action: "secop.login",
          entity: "secop_session",
          entityId: cookieHash,
          metadata: JSON.stringify({ loginOk: true, attempt, retries: attempt }),
        });

        console.log(`[SECOP Auth] Login OK (attempt ${attempt + 1}/${MAX_LOGIN_RETRIES})`);
        console.log(this.tracker.getSummary());
        return this.cachedSession;

      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[SECOP Auth] Login attempt ${attempt + 1}/${MAX_LOGIN_RETRIES} failed: ${lastError.message}`
        );

        // Don't retry if credentials are wrong (not a transient error)
        if (lastError.message.includes("SECOP_BOT_USERNAME")) break;

        // Wait before retry (if not the last attempt)
        if (attempt < MAX_LOGIN_RETRIES - 1) {
          const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    // Log failed SECOP login
    await db.insert(activityLog).values({
      action: "secop.login",
      entity: "secop_session",
      metadata: JSON.stringify({ loginOk: false, error: lastError?.message }),
    }).catch(() => {});

    console.log(this.tracker.getSummary());
    throw lastError ?? new Error("SECOP login failed after all retries");
  }

  /**
   * Clear cached session (forces re-login on next request).
   */
  async clearSession(): Promise<void> {
    this.cachedSession = null;
    await this.cookieStore.delete(SECOP_COOKIE_KEY);
  }

  // ─── Internal (overridable for testing) ────────────────────

  /**
   * Perform the actual SECOP login HTTP request with captcha handling.
   *
   * Flow:
   *   1. GET login page → session cookie + mkey
   *   2. If ReCaptcha present → solve → GET CaptchaCheck?responseKey=TOKEN&mkey=...
   *   3. If image captcha present → solve → captcha text into login form
   *   4. POST to /LoginAuthenticate?mkey=... with credentials
   *   5. 302 redirect → extract auth cookies
   */
  /* protected — for testing via vi.spyOn */
  async doLoginRequest(
    username: string,
    password: string,
    attempt: number = 0
  ): Promise<LoginResponse> {
    // ── Step 1: GET login page ──────────────────────────────
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const loginPageRes = await fetch(SECOP_LOGIN_URL, { headers: BROWSER_HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    const loginPageHtml = await loginPageRes.text();
    const setCookieHeaders = this.extractSetCookie(loginPageRes.headers);
    const cookieJar = this.buildCookieString(setCookieHeaders);

    // Extract mkey from HTML (embedded in onclick handlers)
    const mkey = this.extractMkey(loginPageHtml);

    // ── Step 2: Captcha detection and solving ───────────────
    const solveStart = Date.now();
    const recordId = this.tracker.startAttempt("recaptcha_v2", attempt);

    const captchaResult = await this.captchaSolver.solveIfPresent(
      SECOP_LOGIN_URL,
      loginPageHtml
    );

    const solveDuration = Date.now() - solveStart;
    this.tracker.reportSolve(recordId, captchaResult.solved, solveDuration);

    // ── Step 2b: If ReCaptcha solved → submit to CaptchaCheck ──
    if (captchaResult.solved && captchaResult.token && captchaResult.method === "auto") {
      const captchaCheckUrl = `${SECOP_BASE}/STS/Users/Login/CaptchaCheck?responseKey=${encodeURIComponent(captchaResult.token)}&mkey=${encodeURIComponent(mkey)}`;

      const checkRes = await fetch(captchaCheckUrl, {
        headers: { ...BROWSER_HEADERS, Cookie: cookieJar, Referer: SECOP_LOGIN_URL },
      });

      const checkBody = await checkRes.text().catch(() => "");
      const checkOk = checkRes.ok && !checkBody.includes("error") && !checkBody.includes("Error");
      this.tracker.reportCaptchaCheck(recordId, checkOk);

      if (!checkOk) {
        await this.tracker.persistRecord(recordId);
        throw new Error(
          `CaptchaCheck failed (HTTP ${checkRes.status}). ` +
          `El token de 2captcha puede haber expirado. Reintentando...`
        );
      }
      console.log("[SECOP Auth] CaptchaCheck OK, proceeding to login...");
    }

    // ── Step 3: Build login form ────────────────────────────
    const loginFormData = new URLSearchParams({
      UserName: username,
      Password: password,
      AuthMethod: "FormsAuthentication",
    });

    // If image captcha was solved, include the captcha text
    if (captchaResult.solved && captchaResult.token && this.detectImageCaptchaInHtml(loginPageHtml)) {
      loginFormData.set("VB_txttxtCaptcha", captchaResult.token);
      console.log("[SECOP Auth] Including image captcha text in login form");
    }

    // ── Step 4: POST to LoginAuthenticate ───────────────────
    const loginUrl = `${SECOP_BASE}/STS/Users/Login/LoginAuthenticate?mkey=${encodeURIComponent(mkey)}`;

    const loginRes = await fetch(loginUrl, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieJar,
        Referer: SECOP_LOGIN_URL,
      },
      body: loginFormData,
      redirect: "manual",
    });

    // ── Step 5: Process response ────────────────────────────
    const allCookies = [
      ...setCookieHeaders,
      ...(loginRes.headers.getSetCookie?.() ?? []),
    ];

    if (loginRes.status === 302 || loginRes.ok) {
      const cookieStr = allCookies
        .map((c: string) => c.split(";")[0])
        .join("; ")
        .trim();

      this.tracker.reportLogin(recordId, true);
      await this.tracker.persistRecord(recordId);

      return {
        success: true,
        cookies: cookieStr || "ASP.NET_SessionId=unknown",
        sessionExpiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      };
    }

    // Login failed — check if captcha was the issue
    const body = await loginRes.text().catch(() => "");
    const failedDueToCaptcha =
      body.includes("recaptcha") ||
      body.includes("ReCaptcha") ||
      body.includes('class="captchaElement"');

    this.tracker.reportLogin(recordId, false);
    await this.tracker.persistRecord(recordId);

    if (failedDueToCaptcha) {
      throw new Error(
        "SECOP login bloqueado por CAPTCHA. " +
        "Verifica CAPTCHA_SOLVER_API_KEY en .env.enc."
      );
    }

    throw new Error(
      `SECOP login failed (HTTP ${loginRes.status}). ` +
      `Verifica credenciales en .env.enc.`
    );
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Extract the mkey (machine key) from SECOP's login page HTML.
   * Pattern: mkey=<32-hex-chars> in URL query strings.
   */
  private extractMkey(html: string): string {
    const match = html.match(/mkey=([a-f0-9]{32})/i);
    if (match) return match[1];
    throw new Error(
      "mkey no encontrado en el HTML de SECOP. " +
      "La pagina de login puede haber cambiado. Verificar manualmente."
    );
  }

  /**
   * Extract Set-Cookie headers with legacy fallback for Node <19.
   */
  private extractSetCookie(headers: Headers): string[] {
    if (typeof headers.getSetCookie === "function") {
      return headers.getSetCookie() ?? [];
    }
    // Legacy fallback for Node 18
    const raw = headers.get("set-cookie");
    if (!raw) return [];
    // Multiple Set-Cookie are joined with comma in Node 18
    return raw.split(",").map((c: string) => c.trim());
  }

  /**
   * Build a cookie string from Set-Cookie header values.
   */
  private buildCookieString(setCookieHeaders: string[]): string {
    return setCookieHeaders
      .map((c: string) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");
  }

  /**
   * Check if the HTML contains a custom image captcha element.
   */
  private detectImageCaptchaInHtml(html: string): boolean {
    return (
      html.includes('id="imgCaptcha"') ||
      html.includes('id="imgimgCaptcha"') ||
      html.includes('class="captchaElement"')
    );
  }

  /**
   * Simple hash for cookie values (not cryptographic — just for correlation).
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }
}
