import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptions, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import { validateCsrf, csrfErrorResponse } from "@/lib/security/csrf";
import { logAudit } from "@/lib/audit/logger";

const planLimits: Record<string, number> = {
  basic: 600,
  pro: 3000,
  premium: 10000,
};

const createSubscriptionSchema = z.object({
  plan: z.enum(["basic", "pro", "premium"]),
});

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

    return NextResponse.json({
      subscription: current ?? null,
      userPlan: user?.plan ?? "free",
      pagesUsed: user?.pagesUsed ?? 0,
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Error al obtener suscripcion" },
      { status: 500 }
    );
  }
}

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

    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);

    const result = await db
      .insert(subscriptions)
      .values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        plan: parsed.data.plan,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: end,
        pagesAllocated: planLimits[parsed.data.plan],
      })
      .returning()
      .get();

    await db
      .update(users)
      .set({ plan: parsed.data.plan, pagesUsed: 0 })
      .where(eq(users.id, session.user.id))
      .run();

    await logAudit({
      action: "subscription.create",
      userId: session.user.id,
      entity: "subscription",
      entityId: result.id,
      metadata: JSON.stringify({ plan: parsed.data.plan }),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return NextResponse.json(
      { error: "Error al crear suscripcion" },
      { status: 500 }
    );
  }
}
