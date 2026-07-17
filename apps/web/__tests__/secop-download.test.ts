// ─────────────────────────────────────────────────────────────
// SECOP Download Client — Tests (TDD)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Cookie Store ───────────────────────────────────────────

describe("CookieStore", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should save and load a cookie by key", async () => {
    const { CookieStore } = await import("@/lib/secop/cookie-store");
    const store = new CookieStore(":memory:");
    await store.init();

    await store.save("session-1", "ASP.NET_SessionId=abc123; .ASPXAUTH=xyz789", new Date(Date.now() + 3600000));
    const loaded = await store.load("session-1");

    expect(loaded).not.toBeNull();
    expect(loaded!.cookieValue).toContain("ASP.NET_SessionId=abc123");
    expect(loaded!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("should return null for expired cookies", async () => {
    const { CookieStore } = await import("@/lib/secop/cookie-store");
    const store = new CookieStore(":memory:");
    await store.init();

    await store.save("session-1", "expired-cookie", new Date(Date.now() - 1000));
    const loaded = await store.load("session-1");

    expect(loaded).toBeNull();
  });

  it("should return null for nonexistent keys", async () => {
    const { CookieStore } = await import("@/lib/secop/cookie-store");
    const store = new CookieStore(":memory:");
    await store.init();

    const loaded = await store.load("nobody-exists");
    expect(loaded).toBeNull();
  });

  it("should delete a cookie by key", async () => {
    const { CookieStore } = await import("@/lib/secop/cookie-store");
    const store = new CookieStore(":memory:");
    await store.init();

    await store.save("to-delete", "value", new Date(Date.now() + 3600000));
    await store.delete("to-delete");
    const loaded = await store.load("to-delete");

    expect(loaded).toBeNull();
  });

  it("should list all valid (non-expired) cookies", async () => {
    const { CookieStore } = await import("@/lib/secop/cookie-store");
    const store = new CookieStore(":memory:");
    await store.init();

    await store.save("valid-1", "valid-cookie-1", new Date(Date.now() + 3600000));
    await store.save("valid-2", "valid-cookie-2", new Date(Date.now() + 7200000));
    await store.save("expired-1", "expired", new Date(Date.now() - 1000));

    const valid = await store.listValid();
    expect(valid).toHaveLength(2);
    expect(valid.find((c) => c.key === "valid-1")).toBeDefined();
    expect(valid.find((c) => c.key === "expired-1")).toBeUndefined();
  });
});

// ─── CAPTCHA Solver ─────────────────────────────────────────

describe("CaptchaSolver", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return manual mode when no captcha in HTML", async () => {
    const { CaptchaSolver } = await import("@/lib/secop/captcha-solver");
    const solver = new CaptchaSolver();

    const result = await solver.solveIfPresent(
      "https://example.com",
      "<html>no captcha here</html>"
    );
    expect(result.solved).toBe(false);
    expect(result.method).toBe("manual");
    expect(result.message).toContain("No CAPTCHA");
  });

  it("should return manual mode when captcha detected but no API key", async () => {
    const { CaptchaSolver } = await import("@/lib/secop/captcha-solver");
    const solver = new CaptchaSolver();

    const result = await solver.solveIfPresent(
      "https://example.com",
      '<html><div class="g-recaptcha" data-sitekey="6Lc..."></div></html>'
    );
    expect(result.solved).toBe(false);
    expect(result.method).toBe("manual");
    expect(result.message).toContain("CAPTCHA detectado");
  });

  it("should handle 2captcha ReCaptcha v2 flow (mocked)", async () => {
    const { CaptchaSolver } = await import("@/lib/secop/captcha-solver");
    const solver = new CaptchaSolver("12345678901234567890123456789012");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = url.toString();
      if (urlStr.includes("in.php")) {
        return new Response(JSON.stringify({ status: 1, request: "12345" }));
      }
      if (urlStr.includes("res.php")) {
        return new Response(JSON.stringify({ status: 1, request: "captcha-token-abc" }));
      }
      return originalFetch(url);
    });

    const result = await solver.solveIfPresent(
      "https://example.com",
      '<html><div class="g-recaptcha" data-sitekey="6Lc..."></div></html>'
    );
    expect(result.solved).toBe(true);
    expect(result.token).toBe("captcha-token-abc");
    expect(result.method).toBe("auto");
    expect(result.solvedAt).toBeGreaterThan(0);

    globalThis.fetch = originalFetch;
  });

  it("should detect and solve image captcha via 2captcha (mocked)", async () => {
    const { CaptchaSolver } = await import("@/lib/secop/captcha-solver");
    const solver = new CaptchaSolver("12345678901234567890123456789012");

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = url.toString();
      callCount++;

      // First call: download captcha image
      if (callCount === 1) {
        return new Response(Buffer.from("fake-image-data"));
      }
      // Second call: submit to 2captcha
      if (urlStr.includes("in.php") && urlStr.includes("method=base64")) {
        return new Response(JSON.stringify({ status: 1, request: "img-12345" }));
      }
      // Third call: poll for result
      if (urlStr.includes("res.php")) {
        return new Response(JSON.stringify({ status: 1, request: "ABCDEF" }));
      }
      return originalFetch(url);
    });

    const html = '<html><div><img id="imgimgCaptcha" src="/captcha/image.aspx?123"/></div></html>';
    const result = await solver.solveIfPresent("https://community.secop.gov.co/STS/Users/Login/Index", html);

    expect(result.solved).toBe(true);
    expect(result.token).toBe("ABCDEF");
    expect(result.method).toBe("auto");
    expect(result.message).toContain("Imagen captcha");

    globalThis.fetch = originalFetch;
  });

  it("should prioritize ReCaptcha v2 over image captcha", async () => {
    const { CaptchaSolver } = await import("@/lib/secop/captcha-solver");
    const solver = new CaptchaSolver("12345678901234567890123456789012");

    // HTML with BOTH captcha types — ReCaptcha should win
    const html = `
      <html>
        <div id="divGoogleReCaptchaDiv">
          <div class="g-recaptcha" data-sitekey="6LcMmakZAAAAAB157Q90hORUGtNd790TCws4vBNw"></div>
        </div>
        <div id="divCaptchaLogin" class="captchaElement">
          <img id="imgimgCaptcha" src="/captcha/image.aspx?123"/>
        </div>
      </html>
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = url.toString();
      if (urlStr.includes("in.php")) {
        // Verify it's sending userrecaptcha (not base64)
        expect(urlStr).toContain("method=userrecaptcha");
        return new Response(JSON.stringify({ status: 1, request: "12345" }));
      }
      if (urlStr.includes("res.php")) {
        return new Response(JSON.stringify({ status: 1, request: "recaptcha-token" }));
      }
      return originalFetch(url);
    });

    const result = await solver.solveIfPresent("https://example.com", html);
    expect(result.solved).toBe(true);
    expect(result.token).toBe("recaptcha-token");
    expect(result.method).toBe("auto");

    globalThis.fetch = originalFetch;
  });

  it("should detect token expiry correctly", async () => {
    const { CaptchaSolver } = await import("@/lib/secop/captcha-solver");
    const solver = new CaptchaSolver("12345678901234567890123456789012");

    // Token solved 2 minutes ago — expired
    const oldSolve = Date.now() - 120_000;
    expect(solver.isTokenExpired(oldSolve)).toBe(true);

    // Token solved 5 seconds ago — fresh
    const recentSolve = Date.now() - 5_000;
    expect(solver.isTokenExpired(recentSolve)).toBe(false);
  });
});

// ─── SECOP Auth ─────────────────────────────────────────────

// ─── CaptchaTracker ──────────────────────────────────────────

describe("CaptchaTracker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("should track a full solve flow from startAttempt through reportLogin", async () => {
    const { CaptchaTracker } = await import("@/lib/secop/captcha-tracker");
    const tracker = new CaptchaTracker();

    const id = tracker.startAttempt("recaptcha_v2", 0);
    expect(id).toBeDefined();

    tracker.reportSolve(id, true, 5000);
    tracker.reportCaptchaCheck(id, true);
    tracker.reportLogin(id, true);

    const stats = tracker.getStats();
    expect(stats.totalAttempts).toBe(1);
    expect(stats.solveSuccessRate).toBe(1);
    expect(stats.fullSuccessRate).toBe(1);
    expect(stats.totalCostUsd).toBeGreaterThan(0);
  });

  it("should compute correct stats for mixed successes and failures", async () => {
    const { CaptchaTracker } = await import("@/lib/secop/captcha-tracker");
    const tracker = new CaptchaTracker();

    // 2 successes, 1 failure
    const id1 = tracker.startAttempt("recaptcha_v2", 0);
    tracker.reportSolve(id1, true, 3000);
    tracker.reportCaptchaCheck(id1, true);
    tracker.reportLogin(id1, true);

    const id2 = tracker.startAttempt("recaptcha_v2", 1);
    tracker.reportSolve(id2, true, 4000);
    tracker.reportCaptchaCheck(id2, true);
    tracker.reportLogin(id2, true);

    const id3 = tracker.startAttempt("image", 0);
    tracker.reportSolve(id3, false, 60000, "2captcha: timeout");

    const stats = tracker.getStats();
    expect(stats.totalAttempts).toBe(3);
    expect(stats.solveSuccessRate).toBeCloseTo(2 / 3, 5);
    expect(stats.fullSuccessRate).toBeCloseTo(2 / 3, 5);
  });

  it("should not trip circuit breaker with low usage", async () => {
    const { CaptchaTracker } = await import("@/lib/secop/captcha-tracker");
    const tracker = new CaptchaTracker();

    const id = tracker.startAttempt("recaptcha_v2", 0);
    tracker.reportSolve(id, true, 2000);
    tracker.reportCaptchaCheck(id, true);
    tracker.reportLogin(id, true);

    const cb = tracker.isCircuitBroken();
    expect(cb.broken).toBe(false);
  });

  it("should generate a readable summary without throwing", async () => {
    const { CaptchaTracker } = await import("@/lib/secop/captcha-tracker");
    const tracker = new CaptchaTracker();

    const id = tracker.startAttempt("recaptcha_v2", 0);
    tracker.reportSolve(id, true, 3000);
    tracker.reportLogin(id, true);

    const summary = tracker.getSummary();
    expect(summary).toContain("Captcha Usage Report");
    expect(summary).toContain("$");
  });

  it("should estimate cost differently for recaptcha vs image", async () => {
    const { CaptchaTracker } = await import("@/lib/secop/captcha-tracker");
    const tracker = new CaptchaTracker();

    const recaptchaCost = (tracker as any).estimateCost("recaptcha_v2");
    const imageCost = (tracker as any).estimateCost("image");

    expect(recaptchaCost).toBeGreaterThan(imageCost);
    expect(recaptchaCost).toBe(0.001);
    expect(imageCost).toBe(0.0005);
  });

  it("should loadHistory without crashing (DB graceful handling)", async () => {
    const { CaptchaTracker } = await import("@/lib/secop/captcha-tracker");
    const tracker = new CaptchaTracker();
    await expect(tracker.loadHistory()).resolves.not.toThrow();
  });

  it("should persistRecord without crashing (async DB write)", async () => {
    const { CaptchaTracker } = await import("@/lib/secop/captcha-tracker");
    const tracker = new CaptchaTracker();

    const id = tracker.startAttempt("recaptcha_v2", 0);
    tracker.reportSolve(id, true, 3000);
    tracker.reportLogin(id, true);

    await expect(tracker.persistRecord(id)).resolves.not.toThrow();
  });
});

// ─── SECOP Auth ─────────────────────────────────────────────

describe("SecopAuthClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("should require credentials to be configured", async () => {
    const { SecopAuthClient } = await import("@/lib/secop/auth");
    
    vi.stubEnv("SECOP_BOT_USERNAME", "");
    vi.stubEnv("SECOP_BOT_PASSWORD", "");
    
    const client = new SecopAuthClient();
    await client.init();
    
    await expect(client.login()).rejects.toThrow("SECOP_BOT_USERNAME");
  });

  it("should create a session object on successful login (mocked)", async () => {
    const { SecopAuthClient } = await import("@/lib/secop/auth");
    
    vi.stubEnv("SECOP_BOT_USERNAME", "test-bot");
    vi.stubEnv("SECOP_BOT_PASSWORD", "test-pass");

    const client = new SecopAuthClient();
    await client.init();

    vi.spyOn(client as any, "doLoginRequest").mockResolvedValue({
      success: true,
      cookies: "ASP.NET_SessionId=mock123; .ASPXAUTH=mockAuth",
      sessionExpiresAt: new Date(Date.now() + 3600000),
    });

    const session = await client.login();
    expect(session).toBeDefined();
    expect(session.cookies).toContain("ASP.NET_SessionId");
  });

  it("should use cached session without re-login", async () => {
    const { SecopAuthClient } = await import("@/lib/secop/auth");
    
    vi.stubEnv("SECOP_BOT_USERNAME", "test-bot");
    vi.stubEnv("SECOP_BOT_PASSWORD", "test-pass");

    const client = new SecopAuthClient();
    await client.init();

    const mockLogin = vi.spyOn(client as any, "doLoginRequest").mockResolvedValue({
      success: true,
      cookies: "ASP.NET_SessionId=fresh123",
      sessionExpiresAt: new Date(Date.now() + 3600000),
    });

    const session1 = await client.login();
    expect(session1.cookies).toContain("fresh123");

    mockLogin.mockClear();
    const session2 = await client.getValidSession();
    expect(session2.cookies).toContain("fresh123");
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("should extract mkey from login page HTML", async () => {
    const { SecopAuthClient } = await import("@/lib/secop/auth");
    const client = new SecopAuthClient();
    
    const html = `<div>
      <input onclick="javascript:getAction('/STS/Users/Login/CaptchaCheck?responseKey=test&mkey=d0ee078c83cb438eaf8f95cd8bbdbd1c',true);" />
    </div>`;

    const mkey = (client as any).extractMkey(html);
    expect(mkey).toBe("d0ee078c83cb438eaf8f95cd8bbdbd1c");
  });

  it("should throw when no mkey in HTML", async () => {
    const { SecopAuthClient } = await import("@/lib/secop/auth");
    const client = new SecopAuthClient();
    
    expect(() => (client as any).extractMkey("<html>no mkey here</html>")).toThrow("mkey no encontrado");
  });

  it("should retry login on failure up to MAX_LOGIN_RETRIES times", async () => {
    const { SecopAuthClient } = await import("@/lib/secop/auth");
    
    vi.stubEnv("SECOP_BOT_USERNAME", "test-bot");
    vi.stubEnv("SECOP_BOT_PASSWORD", "test-pass");

    const client = new SecopAuthClient();
    await client.init();

    // Mock to fail twice, succeed on third attempt
    let callCount = 0;
    vi.spyOn(client as any, "doLoginRequest").mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error("SECOP login failed (HTTP 500)");
      }
      return {
        success: true,
        cookies: "ASP.NET_SessionId=retry-ok",
        sessionExpiresAt: new Date(Date.now() + 3600000),
      };
    });

    const session = await client.login();
    expect(session.cookies).toContain("retry-ok");
    expect(callCount).toBe(3); // 2 fails + 1 success
  });

  it("should throw after MAX_LOGIN_RETRIES failures", async () => {
    const { SecopAuthClient } = await import("@/lib/secop/auth");
    
    vi.stubEnv("SECOP_BOT_USERNAME", "test-bot");
    vi.stubEnv("SECOP_BOT_PASSWORD", "test-pass");

    const client = new SecopAuthClient();
    await client.init();

    vi.spyOn(client as any, "doLoginRequest").mockRejectedValue(
      new Error("SECOP login failed (HTTP 500)")
    );

    await expect(client.login()).rejects.toThrow("HTTP 500");
  });
});

// ─── Download Client ────────────────────────────────────────

describe("SecopDownloadClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should download a PDF given a valid FileId", async () => {
    const { SecopDownloadClient } = await import("@/lib/secop/download-client");
    const { SecopAuthClient } = await import("@/lib/secop/auth");

    // Mock auth to avoid real login
    const mockAuth = new SecopAuthClient();
    await mockAuth.init();
    vi.spyOn(mockAuth as any, "doLoginRequest").mockResolvedValue({
      success: true,
      cookies: "ASP.NET_SessionId=mock",
      sessionExpiresAt: new Date(Date.now() + 3600000),
    });
    await mockAuth.login(); // Pre-login so session is cached

    const client = new SecopDownloadClient(mockAuth);

    // Mock the HTTP download
    vi.spyOn(client as any, "downloadFile").mockResolvedValue(
      Buffer.from("%PDF-1.4 mock pdf content...")
    );

    const pdf = await client.downloadByFileId("12345");
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.toString().startsWith("%PDF")).toBe(true);
  });

  it("should throw when FileId returns 404", async () => {
    const { SecopDownloadClient } = await import("@/lib/secop/download-client");
    const { SecopAuthClient } = await import("@/lib/secop/auth");

    const mockAuth = new SecopAuthClient();
    await mockAuth.init();
    vi.spyOn(mockAuth as any, "doLoginRequest").mockResolvedValue({
      success: true,
      cookies: "ASP.NET_SessionId=mock",
      sessionExpiresAt: new Date(Date.now() + 3600000),
    });
    await mockAuth.login();

    const client = new SecopDownloadClient(mockAuth);
    vi.spyOn(client as any, "downloadFile").mockRejectedValue(new Error("HTTP 404"));

    await expect(client.downloadByFileId("99999")).rejects.toThrow("HTTP 404");
  });

  it("should get a pliego PDF for a proceso (mocked full flow)", async () => {
    const { SecopDownloadClient } = await import("@/lib/secop/download-client");
    const { SecopAuthClient } = await import("@/lib/secop/auth");

    const mockAuth = new SecopAuthClient();
    await mockAuth.init();
    vi.spyOn(mockAuth as any, "doLoginRequest").mockResolvedValue({
      success: true,
      cookies: "ASP.NET_SessionId=valid",
      sessionExpiresAt: new Date(Date.now() + 3600000),
    });
    await mockAuth.login();

    const client = new SecopDownloadClient(mockAuth);

    // Mock: process page returns a FileId
    vi.spyOn(client as any, "fetchFileIdFromProcess").mockResolvedValue("67890");
    // Mock: download with that FileId succeeds
    vi.spyOn(client as any, "downloadFile").mockResolvedValue(
      Buffer.from("%PDF-1.4 real pliego content...")
    );

    const pdf = await client.getPliegoPdf(
      "CO1.REQ.1234567",
      "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.1234567"
    );
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(0);
  });
});
