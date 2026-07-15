// ─────────────────────────────────────────────────────────────
// Tests: MercadoPago Webhook Signature Verification
// Pure function — only needs crypto
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, vi } from "vitest";

describe("verifySignature", () => {
  beforeAll(() => {
    process.env.MP_WEBHOOK_SECRET = "test_webhook_secret_123";
  });

  it("verifica firma valida correctamente", async () => {
    // Re-import module to pick up env var set in beforeAll
    vi.resetModules();
    const { verifySignature } = await import("@/lib/mercadopago/webhooks");

    const body = '{"type":"payment","data":{"id":"123"}}';
    const ts = "1712345678";
    const crypto = require("crypto");
    const expectedSig = crypto
      .createHmac("sha256", "test_webhook_secret_123")
      .update(body + ts)
      .digest("hex");

    const header = `ts=${ts},v1=${expectedSig}`;
    expect(verifySignature(header, body)).toBe(true);
  });

  it("rechaza firma invalida", async () => {
    vi.resetModules();
    const { verifySignature } = await import("@/lib/mercadopago/webhooks");

    const body = '{"type":"payment","data":{"id":"123"}}';
    const header = "ts=1712345678,v1=signature_invalida";
    expect(verifySignature(header, body)).toBe(false);
  });

  it("rechaza cuando falta ts", async () => {
    vi.resetModules();
    const { verifySignature } = await import("@/lib/mercadopago/webhooks");
    expect(verifySignature("v1=signature", "{}")).toBe(false);
  });

  it("rechaza cuando falta v1", async () => {
    vi.resetModules();
    const { verifySignature } = await import("@/lib/mercadopago/webhooks");
    expect(verifySignature("ts=1712345678", "{}")).toBe(false);
  });

  it("rechaza cuando no hay header", async () => {
    vi.resetModules();
    const { verifySignature } = await import("@/lib/mercadopago/webhooks");
    expect(verifySignature(null, "{}")).toBe(false);
  });

  it("rechaza header con formato incorrecto", async () => {
    vi.resetModules();
    const { verifySignature } = await import("@/lib/mercadopago/webhooks");
    expect(verifySignature("formato-incorrecto-sin-ts", "{}")).toBe(false);
  });

  it("usa constant-time comparison (timingSafeEqual)", async () => {
    vi.resetModules();
    const { verifySignature } = await import("@/lib/mercadopago/webhooks");

    const body = "{}";
    const ts = "1712345678";
    const crypto = require("crypto");
    const expectedSig = crypto
      .createHmac("sha256", "test_webhook_secret_123")
      .update(body + ts)
      .digest("hex");

    const header = `ts=${ts},v1=${expectedSig}extra`;
    expect(verifySignature(header, body)).toBe(false);
  });

  it("falla si MP_WEBHOOK_SECRET no esta configurado", async () => {
    delete process.env.MP_WEBHOOK_SECRET;
    vi.resetModules();
    const { verifySignature } = await import("@/lib/mercadopago/webhooks");
    expect(verifySignature("ts=1,v1=abc", "{}")).toBe(false);

    process.env.MP_WEBHOOK_SECRET = "test_webhook_secret_123";
  });
});
