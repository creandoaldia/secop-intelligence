// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — MercadoPago API Client
// Wrapper around mercadopago SDK with config guard
// ─────────────────────────────────────────────────────────────

import { z } from "zod";
import type {
  MPPreferenceRequest,
  MPPreferenceResponse,
  MPSubscriptionRequest,
  MPSubscriptionResponse,
} from "./types";

// ─── Config ────────────────────────────────────────────────

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

function isConfigured(): boolean {
  return !!MP_ACCESS_TOKEN;
}

function notConfiguredError(): never {
  throw new Error(
    "MercadoPago no configurado. Define MP_ACCESS_TOKEN en .env"
  );
}

// ─── SDK Helpers ───────────────────────────────────────────

function getConfig(): import("mercadopago").MercadoPagoConfig {
  const { MercadoPagoConfig } = require("mercadopago") as typeof import("mercadopago");
  return new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN! });
}

// ─── Sandbox Detection ─────────────────────────────────────

export function isSandbox(): boolean {
  return (MP_ACCESS_TOKEN ?? "").startsWith("TEST-");
}

export function getInitPoint(preference: MPPreferenceResponse): string {
  return isSandbox() ? preference.sandbox_init_point : preference.init_point;
}

// ─── Preference (one-time payment) ─────────────────────────

const preferenceSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().int().positive(),
    unit_price: z.number().positive(),
    currency_id: z.string().default("COP"),
    category_id: z.string().optional(),
  })).min(1),
  payer: z.object({ email: z.string().email().optional() }).optional(),
  back_urls: z.object({
    success: z.string().optional(),
    failure: z.string().optional(),
    pending: z.string().optional(),
  }).optional(),
  auto_return: z.enum(["approved", "all"]).optional(),
  notification_url: z.string().optional(),
  statement_descriptor: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function createPreference(
  req: MPPreferenceRequest
): Promise<MPPreferenceResponse> {
  if (!isConfigured()) notConfiguredError();
  const parsed = preferenceSchema.parse(req);

  const { Preference } = await import("mercadopago");
  const preference = new Preference(getConfig());
  const result = await preference.create({ body: parsed });

  return {
    id: result.id!,
    init_point: result.init_point!,
    sandbox_init_point: result.sandbox_init_point!,
    collector_id: result.collector_id!,
    client_id: result.client_id!,
    date_created: result.date_created!,
    metadata: result.metadata as Record<string, unknown> | undefined,
  };
}

export async function getPreference(
  id: string
): Promise<MPPreferenceResponse | null> {
  if (!isConfigured()) notConfiguredError();
  try {
    const { Preference } = await import("mercadopago");
    const preference = new Preference(getConfig());
    const result = await preference.get({ preferenceId: id });
    return {
      id: result.id!,
      init_point: result.init_point!,
      sandbox_init_point: result.sandbox_init_point!,
      collector_id: result.collector_id!,
      client_id: result.client_id!,
      date_created: result.date_created!,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("404")) return null;
    throw error;
  }
}

// ─── Subscription (preapproval) ────────────────────────────

const subscriptionSchema = z.object({
  reason: z.string().min(1),
  external_reference: z.string().optional(),
  payer_email: z.string().email().optional(),
  card_token_id: z.string().optional(),
  auto_recurring: z.object({
    frequency: z.number().int().positive(),
    frequency_type: z.enum(["days", "months"]),
    transaction_amount: z.number().positive(),
    currency_id: z.string().default("COP"),
    billing_day: z.number().int().min(1).max(28).optional(),
    billing_day_proportional: z.boolean().optional(),
    free_trial: z.object({
      frequency: z.number().int().positive(),
      frequency_type: z.enum(["days", "months"]),
    }).optional(),
  }),
  back_url: z.string().optional(),
  notification_url: z.string().optional(),
});

export async function createSubscription(
  req: MPSubscriptionRequest
): Promise<MPSubscriptionResponse> {
  if (!isConfigured()) notConfiguredError();
  const parsed = subscriptionSchema.parse(req);

  const { PreApproval } = await import("mercadopago");
  const preapproval = new PreApproval(getConfig());
  const result = await preapproval.create({ body: parsed });

  return {
    id: result.id!,
    reason: result.reason!,
    external_reference: result.external_reference,
    status: result.status as MPSubscriptionResponse["status"],
    init_point: result.init_point,
    auto_recurring: {
      frequency: result.auto_recurring!.frequency!,
      frequency_type: result.auto_recurring!.frequency_type!,
      transaction_amount: result.auto_recurring!.transaction_amount!,
      currency_id: result.auto_recurring!.currency_id!,
    },
    date_created: result.date_created!,
    last_modified: result.last_modified!,
  };
}

export async function getSubscription(
  id: string
): Promise<MPSubscriptionResponse | null> {
  if (!isConfigured()) notConfiguredError();
  try {
    const { PreApproval } = await import("mercadopago");
    const preapproval = new PreApproval(getConfig());
    const result = await preapproval.get({ id });
    return {
      id: result.id!,
      reason: result.reason!,
      external_reference: result.external_reference,
      status: result.status as MPSubscriptionResponse["status"],
      init_point: result.init_point,
      auto_recurring: result.auto_recurring as MPSubscriptionResponse["auto_recurring"],
      date_created: result.date_created!,
      last_modified: result.last_modified!,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("404")) return null;
    throw error;
  }
}

export async function cancelSubscription(
  id: string
): Promise<void> {
  if (!isConfigured()) notConfiguredError();
  const { PreApproval } = await import("mercadopago");
  const preapproval = new PreApproval(getConfig());
  await preapproval.update({
    id,
    body: { status: "cancelled" },
  });
}
