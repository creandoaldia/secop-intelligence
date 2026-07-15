import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptions, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { validateCsrf, csrfErrorResponse } from "@/lib/security/csrf";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit/logger";
import { cancelSubscription as cancelMpSubscription } from "@/lib/mercadopago/client";
import { PLAN_PRICING } from "@/lib/mercadopago/types";

const updateSubscriptionSchema = z.object({
  action: z.enum(["cancel", "change"]),
  plan: z.enum(["basic", "pro", "premium"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitMiddleware(`sub-update:${session.user.id}`, { maxRequests: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }
  const csrf = validateCsrf(request);
  if (!csrf.valid) return csrfErrorResponse();

  try {
    const existing = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, params.id), eq(subscriptions.userId, session.user.id)))
      .get();

    if (!existing) {
      return NextResponse.json({ error: "Suscripcion no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.action === "cancel") {
      // Cancel in MercadoPago first (best-effort)
      if (existing.mpSubscriptionId) {
        try {
          await cancelMpSubscription(existing.mpSubscriptionId);
        } catch (mpError) {
          console.warn("[Subscriptions] MP cancel failed, cancelling locally:", mpError);
        }
      }

      await db
        .update(subscriptions)
        .set({ status: "cancelled" })
        .where(and(eq(subscriptions.id, params.id), eq(subscriptions.userId, session.user.id)))
        .run();

      await db
        .update(users)
        .set({ plan: "free" })
        .where(eq(users.id, session.user.id))
        .run();

      await logAudit({
        action: "subscription.cancel",
        userId: session.user.id,
        entity: "subscription",
        entityId: params.id,
        metadata: JSON.stringify({ mpSubscriptionId: existing.mpSubscriptionId }),
      });
    }

    if (parsed.data.action === "change" && parsed.data.plan) {
      const now = new Date();
      const end = new Date(now);
      end.setMonth(end.getMonth() + 1);
      const pricing = PLAN_PRICING[parsed.data.plan];

      await db
        .update(subscriptions)
        .set({
          plan: parsed.data.plan,
          pagesAllocated: pricing.pagesPerMonth,
          currentPeriodStart: now,
          currentPeriodEnd: end,
        })
        .where(and(eq(subscriptions.id, params.id), eq(subscriptions.userId, session.user.id)))
        .run();

      await db
        .update(users)
        .set({ plan: parsed.data.plan, pagesUsed: 0, planExpiresAt: end })
        .where(eq(users.id, session.user.id))
        .run();

      await logAudit({
        action: "subscription.change",
        userId: session.user.id,
        entity: "subscription",
        entityId: params.id,
        metadata: JSON.stringify({ plan: parsed.data.plan }),
      });
    }

    const updated = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, params.id))
      .get();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating subscription:", error);
    return NextResponse.json(
      { error: "Error al actualizar suscripcion" },
      { status: 500 }
    );
  }
}
