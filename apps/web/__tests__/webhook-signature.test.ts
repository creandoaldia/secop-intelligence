// ─────────────────────────────────────────────────────────────
// Tests: MercadoPago Webhook Signature Verification
// Uses the official SDK WebhookSignatureValidator
// Template format: id:<dataId>;request-id:<xRequestId>;ts:<ts>;
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, vi } from "vitest";
import crypto from "crypto";

const SECRET = "test_webhook_secret_123";
const DATA_ID = "123";
const REQ_ID = "abc-123";

/**
 * Build a valid X-Signature header value using the MP template.
 */
function buildValidSignature(
  dataId: string,
  requestId: string,
  ts: string
): string {
  const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto
    .createHmac("sha256", SECRET)
    .update(template)
    .digest("hex");
  return `ts=${ts},v1=${hash}`;
}

describe("validateWebhookSignature", () => {
  beforeAll(() => {
    process.env.MP_WEBHOOK_SECRET = SECRET;
  });

  it("verifica firma valida correctamente", async () => {
    vi.resetModules();
    const { validateWebhookSignature } = await import(
      "@/lib/mercadopago/webhooks"
    );

    // Note: MercadoPago SDK compares ts against Date.now() (ms),
    // so we use milliseconds here, not seconds.
    const ts = Date.now().toString();
    const xSignature = buildValidSignature(DATA_ID, REQ_ID, ts);

    expect(validateWebhookSignature(xSignature, REQ_ID, DATA_ID)).toBe(true);
  });

  it("rechaza cuando x-request-id no coincide con la firma", async () => {
    vi.resetModules();
    const { validateWebhookSignature } = await import(
      "@/lib/mercadopago/webhooks"
    );

    const ts = Date.now().toString();
    // Build signature for REQ_ID but validate with a different request ID
    const xSignature = buildValidSignature(DATA_ID, REQ_ID, ts);

    expect(
      validateWebhookSignature(xSignature, "different-req-id", DATA_ID)
    ).toBe(false);
  });

  it("rechaza cuando data.id esta vacio", async () => {
    vi.resetModules();
    const { validateWebhookSignature } = await import(
      "@/lib/mercadopago/webhooks"
    );

    expect(validateWebhookSignature("ts=1,v1=abc", REQ_ID, "")).toBe(false);
  });

  it("rechaza cuando x-signature esta vacio (ausente)", async () => {
    vi.resetModules();
    const { validateWebhookSignature } = await import(
      "@/lib/mercadopago/webhooks"
    );

    expect(validateWebhookSignature("", REQ_ID, DATA_ID)).toBe(false);
  });

  it("rechaza x-signature malformado", async () => {
    vi.resetModules();
    const { validateWebhookSignature } = await import(
      "@/lib/mercadopago/webhooks"
    );

    expect(
      validateWebhookSignature("formato-incorrecto-sin-ts", REQ_ID, DATA_ID)
    ).toBe(false);
  });

  it("rechaza firma invalida (hash incorrecto)", async () => {
    vi.resetModules();
    const { validateWebhookSignature } = await import(
      "@/lib/mercadopago/webhooks"
    );

    const ts = Date.now().toString();
    const xSignature = `ts=${ts},v1=hash_incorrecto`;

    expect(validateWebhookSignature(xSignature, REQ_ID, DATA_ID)).toBe(false);
  });

  it("rechaza timestamp fuera de tolerancia (300s)", async () => {
    vi.resetModules();
    const { validateWebhookSignature } = await import(
      "@/lib/mercadopago/webhooks"
    );

    const oldTs = (Date.now() - 600_000).toString(); // 10 min ago
    const xSignature = buildValidSignature(DATA_ID, REQ_ID, oldTs);

    expect(validateWebhookSignature(xSignature, REQ_ID, DATA_ID)).toBe(false);
  });

  it("falla si MP_WEBHOOK_SECRET no esta configurado", async () => {
    delete process.env.MP_WEBHOOK_SECRET;
    vi.resetModules();
    const { validateWebhookSignature } = await import(
      "@/lib/mercadopago/webhooks"
    );

    expect(validateWebhookSignature("ts=1,v1=abc", REQ_ID, DATA_ID)).toBe(
      false
    );

    process.env.MP_WEBHOOK_SECRET = SECRET;
  });
});
