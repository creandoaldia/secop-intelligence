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

  it("should handle 2captcha API flow (mocked)", async () => {
    const { CaptchaSolver } = await import("@/lib/secop/captcha-solver");
    const solver = new CaptchaSolver("12345678901234567890123456789012"); // valid format: 32 chars

    // Mock fetch to return captcha submitted
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

    // Restore fetch
    globalThis.fetch = originalFetch;
  });
});

// ─── SECOP Auth ─────────────────────────────────────────────

describe("SecopAuthClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should require credentials to be configured", async () => {
    const { SecopAuthClient } = await import("@/lib/secop/auth");
    
    // Clear env vars for this test
    vi.stubEnv("SECOP_BOT_USERNAME", "");
    vi.stubEnv("SECOP_BOT_PASSWORD", "");
    
    const client = new SecopAuthClient();
    await client.init(); // CookieStore needs init even for in-memory
    
    await expect(client.login()).rejects.toThrow("SECOP_BOT_USERNAME");
  });

  it("should create a session object on successful login (mocked)", async () => {
    const { SecopAuthClient } = await import("@/lib/secop/auth");
    
    // Set env vars for this test
    vi.stubEnv("SECOP_BOT_USERNAME", "test-bot");
    vi.stubEnv("SECOP_BOT_PASSWORD", "test-pass");

    const client = new SecopAuthClient();
    await client.init();

    // Mock the internal HTTP call
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

    // First login
    const session1 = await client.login();
    expect(session1.cookies).toContain("fresh123");

    // Second call should reuse the cached session (no second login call)
    mockLogin.mockClear();
    const session2 = await client.getValidSession();
    expect(session2.cookies).toContain("fresh123");
    expect(mockLogin).not.toHaveBeenCalled();
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
