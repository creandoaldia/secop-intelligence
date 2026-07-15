import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptions, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import { validateCsrf, csrfErrorResponse } from "@/lib/security/csrf";
import { logAudit } from "@/lib/audit/logger";
import { createSubscription as createMpSubscription, isSandbox } from "@/lib/mercadopago/client";
import { PLAN_PRICING } from "@/lib/mercadopago/types";

// ─── Config ────────────────────────────────────────────────

const MP_CONFIGURED = !!(process.env.MP_ACCESS_TOKEN);

const createSubscriptionSchema = z.object({
  plan: z.enum(["basic", "pro", "premium"]),
  mpPreapprovalPlanId: z.string().optional(), // Optional: pre-existing MP plan
});

// ─── GET /api/subscriptions ────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitMiddleware(`sub-list:${session.user.id}`, { maxRequests: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const current = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1)
      .get();

    const user = await db
      .select({ plan: users.plan, pagesUsed: users.pagesUsed })
      .from(users)
      .where(eq(users.id, session.user.id))
      .get();

    const pricing = user?.plan && user.plan !== "free"
      ? PLAN_PRICING[user.plan as keyof typeof PLAN_PRICING]
      : null;

    return NextResponse.json({
      subscription: current ?? null,
      userPlan: user?.plan ?? "free",
      pagesUsed: user?.pagesUsed ?? 0,
      pricing,
      mpConfigured: MP_CONFIGURED,
      mpSandbox: MP_CONFIGURED && isSandbox(),
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Error al obtener suscripcion" },
      { status: 500 }
    );
  }
}

// ─── POST /api/subscriptions ───────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitMiddleware(`sub-create:${session.user.id}`, { maxRequests: 5, windowMs: 3600_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }
  const csrf = validateCsrf(request);
  if (!csrf.valid) return csrfErrorResponse();

  try {
    const body = await request.json();
    const parsed = createSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Plan invalido", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { plan, mpPreapprovalPlanId } = parsed.data;
    const pricing = PLAN_PRICING[plan];
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);

    const subId = crypto.randomUUID();
    let mpSubscriptionId: string | null = null;
    let mpInitPoint: string | null = null;

    // ── Integracion MercadoPago ──────────────────────────
    if (MP_CONFIGURED) {
      try {
        const notificationUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/webhooks/mercadopago`;
        const backUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/suscripcion`;

        const mpSub = await createMpSubscription({
          reason: `Suscripcion ${pricing.label} - SECOP Intelligence`,
          external_reference: subId,
          payer_email: session.user.email ?? undefined,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: pricing.price,
            currency_id: pricing.currency,
          },
          back_url: backUrl,
          notification_url: notificationUrl,
          ...(mpPreapprovalPlanId ? { preapproval_plan_id: mpPreapprovalPlanId } : {}),
        });

        mpSubscriptionId = mpSub.id;
        mpInitPoint = mpSub.init_point ?? null;
      } catch (mpError) {
        console.error("[Subscriptions] MP integration failed, falling back to direct activation:", mpError);
        // Fallback: if MP fails, still create subscription as active
        // (dev mode without MP configured or MP error)
      }
    }

    // ── Create local subscription ────────────────────────
    const result = await db
      .insert(subscriptions)
      .values({
        id: subId,
        userId: session.user.id,
        plan,
        mpSubscriptionId: mpSubscriptionId,
        mpPreapprovalId: mpPreapprovalPlanId ?? null,
        status: mpSubscriptionId ? "active" : "active", // active immediately for now
        currentPeriodStart: now,
        currentPeriodEnd: end,
        pagesAllocated: pricing.pagesPerMonth,
      })
      .returning()
      .get();

    // ── Update user plan ─────────────────────────────────
    await db
      .update(users)
      .set({ plan, pagesUsed: 0, planExpiresAt: end })
      .where(eq(users.id, session.user.id))
      .run();

    await logAudit({
      action: "subscription.create",
      userId: session.user.id,
      entity: "subscription",
      entityId: result.id,
      metadata: JSON.stringify({
        plan,
        mpConnected: !!mpSubscriptionId,
        mpSandbox: MP_CONFIGURED && isSandbox(),
      }),
    });

    return NextResponse.json({
      ...result,
      mpInitPoint, // Frontend redirects here for payment
      mpConfigured: MP_CONFIGURED,
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return NextResponse.json(
      { error: "Error al crear suscripcion" },
      { status: 500 }
    );
  }
}
