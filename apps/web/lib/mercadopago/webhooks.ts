// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — MercadoPago Webhook Verification
// X-Signature header validation + event processing
// ─────────────────────────────────────────────────────────────

import crypto from "crypto";
import { WebhookSignatureValidator, InvalidWebhookSignatureError } from "mercadopago";
import { db } from "@/lib/db";
import { mpWebhookEvents, subscriptions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit/logger";
import { z } from "zod";

type MercadoPagoEvent = Record<string, unknown> & {
  type?: string;
  action?: string;
  data?: { id: string };
};

// ─── Config ────────────────────────────────────────────────

const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;

function isConfigured(): boolean {
  return !!MP_WEBHOOK_SECRET;
}

function notConfiguredError(): never {
  throw new Error(
    "MercadoPago webhook no configurado. Define MP_WEBHOOK_SECRET en .env"
  );
}

// ─── Signature Verification ────────────────────────────────

/**
 * Validate MercadoPago X-Signature header using the official SDK.
 * MP template: "id:<dataId>;request-id:<xRequestId>;ts:<ts>;"
 */
export function validateWebhookSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string
): boolean {
  if (!MP_WEBHOOK_SECRET) return false;
  try {
    WebhookSignatureValidator.validate({
      xSignature,
      xRequestId,
      dataId,
      secret: MP_WEBHOOK_SECRET,
      toleranceSeconds: 300,
    });
    return true;
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return false;
    }
    throw error;
  }
}

// ─── Event Processing ──────────────────────────────────────

const subscriptionEventSchema = z.object({
  type: z.string(),
  action: z.string(),
  data: z.object({ id: z.string() }),
});

export async function processWebhookEvent(
  rawEvent: MercadoPagoEvent
): Promise<{ handled: boolean; action: string }> {
  const eventId = rawEvent.id as string || `${rawEvent.type}_${rawEvent.data?.id}_${rawEvent.action}`;

  // Dedup: check if already processed
  const existing = await db
    .select({ id: mpWebhookEvents.id })
    .from(mpWebhookEvents)
    .where(eq(mpWebhookEvents.eventId, eventId))
    .get();

  if (existing) {
    return { handled: true, action: "duplicate_skipped" };
  }

  // Log raw event
  await db.insert(mpWebhookEvents).values({
    id: crypto.randomUUID(),
    eventId,
    type: String(rawEvent.type ?? rawEvent.action ?? "unknown"),
    data: JSON.stringify(rawEvent),
  }).run();

  const parsed = subscriptionEventSchema.safeParse(rawEvent);
  if (!parsed.success) {
    return { handled: false, action: "unparseable" };
  }

  const { type, data } = parsed.data;
  const mpId = data.id;

  // ─── Subscription Events ────────────────────────────────
  if (
    type === "subscription_authorized" ||
    type === "preapproval" ||
    type === "subscription_updated"
  ) {
    await handleSubscriptionEvent(mpId, rawEvent);
    return { handled: true, action: "subscription_synced" };
  }

  if (type === "subscription_cancelled") {
    await handleCancellation(mpId);
    return { handled: true, action: "subscription_cancelled" };
  }

  // ─── Payment Events ─────────────────────────────────────
  if (type === "payment") {
    await handlePaymentEvent(mpId);
    return { handled: true, action: "payment_recorded" };
  }

  return { handled: false, action: "unhandled_type" };
}

async function handleSubscriptionEvent(
  mpSubscriptionId: string,
  _rawEvent: MercadoPagoEvent
): Promise<void> {
  // Find local subscription by mpSubscriptionId
  const sub = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.mpSubscriptionId, mpSubscriptionId))
    .get();

  if (!sub) {
    console.warn(`[MP Webhook] Subscription ${mpSubscriptionId} not found locally`);
    return;
  }

  // Extend period
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db.update(subscriptions)
    .set({
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    })
    .where(eq(subscriptions.id, sub.id))
    .run();

  // Upgrade user plan on subscription_authorized or preapproval
  if (
    _rawEvent.type === "subscription_authorized" ||
    _rawEvent.type === "preapproval"
  ) {
    await db.update(users)
      .set({ plan: sub.plan })
      .where(eq(users.id, sub.userId))
      .run();
  }

  // Reset user pages
  await db.update(users)
    .set({ pagesUsed: 0, pagesResetAt: now })
    .where(eq(users.id, sub.userId))
    .run();

  await logAudit({
    action: "subscription.renewed",
    userId: sub.userId,
    entity: "subscription",
    entityId: sub.id,
    metadata: JSON.stringify({ mpSubscriptionId, periodEnd: periodEnd.toISOString() }),
  });
}

async function handleCancellation(
  mpSubscriptionId: string
): Promise<void> {
  const sub = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.mpSubscriptionId, mpSubscriptionId))
    .get();

  if (!sub) return;

  await db.update(subscriptions)
    .set({ status: "cancelled" })
    .where(eq(subscriptions.id, sub.id))
    .run();

  await db.update(users)
    .set({ plan: "free" })
    .where(eq(users.id, sub.userId))
    .run();

  await logAudit({
    action: "subscription.cancelled",
    userId: sub.userId,
    entity: "subscription",
    entityId: sub.id,
    metadata: JSON.stringify({ mpSubscriptionId }),
  });
}

async function handlePaymentEvent(
  _mpPaymentId: string
): Promise<void> {
  // Payment events are recorded for reference.
  // Subscription renewal is handled by subscription_authorized events.
  // For one-time payments, extend subscription period.
  console.debug(`[MP Webhook] Payment event recorded: ${_mpPaymentId}`);
}

// ─── Export configured check ───────────────────────────────

export { isConfigured as isWebhookConfigured };
