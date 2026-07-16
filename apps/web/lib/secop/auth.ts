// ─────────────────────────────────────────────────────────────
// SecopAuthClient — SECOP II login + session management
// Handles authentication to community.secop.gov.co,
// cookie caching via CookieStore, and session refresh.
// ─────────────────────────────────────────────────────────────

import { CookieStore, StoredCookie } from "./cookie-store";
import { CaptchaSolver } from "./captcha-solver";

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

const SECOP_LOGIN_URL = "https://community.secop.gov.co/STS/Users/Login/Index";
const SECOP_COOKIE_KEY = "secop-session";
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 min (conservative)

// ─── Auth Client ────────────────────────────────────────────

export class SecopAuthClient {
  private cookieStore: CookieStore;
  private captchaSolver: CaptchaSolver;
  private cachedSession: SecopSession | null = null;

  constructor(cookieStore?: CookieStore, captchaSolver?: CaptchaSolver) {
    this.cookieStore =
      cookieStore ?? new CookieStore();
    this.captchaSolver =
      captchaSolver ?? new CaptchaSolver();
  }

  /**
   * Initialize the cookie store (must be called before use).
   */
  async init(): Promise<void> {
    await this.cookieStore.init();
  }

  /**
   * Get a valid session — from cache, from CookieStore, or by logging in.
   */
  async getValidSession(): Promise<SecopSession> {
    // 1. Check in-memory cache
    if (
      this.cachedSession &&
      this.cachedSession.expiresAt > new Date()
    ) {
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

    const loginResult = await this.doLoginRequest(username, password);

    if (!loginResult.success) {
      throw new Error(
        `SECOP login failed. Verifica credenciales en .env.enc. ` +
        `Si hay CAPTCHA, configurar CAPTCHA_SOLVER_API_KEY.`
      );
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

    return this.cachedSession;
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
   * Perform the actual SECOP login HTTP request.
   * This can be mocked in tests via vi.spyOn.
   */
  /* protected — for testing via vi.spyOn */
  async doLoginRequest(
    username: string,
    password: string
  ): Promise<LoginResponse> {
    const loginPageRes = await fetch(SECOP_LOGIN_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CO,es;q=0.9",
      },
    });

    const loginPageHtml = await loginPageRes.text();
    const setCookieHeaders = loginPageRes.headers.getSetCookie?.() ?? [];

    // Check for CAPTCHA on the login page
    const captchaResult = await this.captchaSolver.solveIfPresent(
      SECOP_LOGIN_URL,
      loginPageHtml
    );

    if (captchaResult.solved && captchaResult.token) {
      // Submit the CAPTCHA token along with login
      // This is needed if SECOP presents CAPTCHA on the login page
      console.log("[SECOP Auth] CAPTCHA resuelto, enviando token...");
    }

    if (captchaResult.method === "manual" && captchaResult.message.includes("CAPTCHA")) {
      console.warn("[SECOP Auth]", captchaResult.message);
      // Try to login anyway — CAPTCHA may not always appear
    }

    // Perform the actual login POST
    const loginFormData = new URLSearchParams({
      UserName: username,
      Password: password,
      // SECOP STS expects these fields
      AuthMethod: "FormsAuthentication",
    });

    const loginRes = await fetch(SECOP_LOGIN_URL, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: SECOP_LOGIN_URL,
      },
      body: loginFormData,
      redirect: "manual", // Don't follow redirects — we need the cookies
    });

    // Collect cookies from the login response
    const allCookies = [
      ...setCookieHeaders,
      ...(loginRes.headers.getSetCookie?.() ?? []),
    ];

    // If login succeeded (302 redirect to home), we get auth cookies
    if (loginRes.status === 302 || loginRes.ok) {
      const cookieStr = allCookies
        .map((c: string) => c.split(";")[0]) // Take just the key=value part
        .join("; ");

      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      return {
        success: true,
        cookies: cookieStr || "ASP.NET_SessionId=unknown",
        sessionExpiresAt: expiresAt,
      };
    }

    // Login failed
    const body = await loginRes.text().catch(() => "");
    const failedDueToCaptcha = body.includes("recaptcha") || body.includes("ReCaptcha");

    if (failedDueToCaptcha) {
      throw new Error(
        "SECOP login bloqueado por CAPTCHA. " +
        "Configura CAPTCHA_SOLVER_API_KEY en .env.enc para resolucion automatica."
      );
    }

    throw new Error(
      `SECOP login failed (HTTP ${loginRes.status}). ` +
      `Verifica credenciales en .env.enc.`
    );
  }
}
