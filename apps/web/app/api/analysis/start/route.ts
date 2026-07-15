import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canUseFeature, hasPagesRemaining } from "@/lib/auth";
import { db } from "@/lib/db";
import { analysisJobs, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import { validateCsrf, csrfErrorResponse } from "@/lib/security/csrf";
import { logAudit } from "@/lib/audit/logger";

const startAnalysisSchema = z.object({
  procesoId: z.string().min(1),
  paginasEstimadas: z.number().int().positive().default(1),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitMiddleware(`analysis-start:${session.user.id}`, { maxRequests: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }
  const csrf = validateCsrf(request);
  if (!csrf.valid) return csrfErrorResponse();

  try {
    const body = await request.json();
    const parsed = startAnalysisSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Feature gating
    if (!canUseFeature(session.user.plan ?? "free", "analisis")) {
      return NextResponse.json(
        { error: "Funcion no disponible en tu plan actual. Actualiza para acceder." },
        { status: 403 }
      );
    }

    // Pages check
    const user = await db
      .select({ pagesUsed: users.pagesUsed, plan: users.plan })
      .from(users)
      .where(eq(users.id, session.user.id))
      .get();

    if (!user || !hasPagesRemaining(user.pagesUsed, user.plan, parsed.data.paginasEstimadas)) {
      return NextResponse.json(
        { error: "Has alcanzado el limite de paginas de tu plan. Actualiza para continuar." },
        { status: 403 }
      );
    }

    const jobId = crypto.randomUUID();

    await db
      .insert(analysisJobs)
      .values({
        id: jobId,
        userId: session.user.id,
        procesoId: parsed.data.procesoId,
        estado: "pending",
        paginasTotal: parsed.data.paginasEstimadas,
      })
      .run();

    await db
      .update(users)
      .set({ pagesUsed: (user.pagesUsed ?? 0) + parsed.data.paginasEstimadas })
      .where(eq(users.id, session.user.id))
      .run();

    await logAudit({
      action: "analysis.start",
      userId: session.user.id,
      entity: "analysis_job",
      entityId: jobId,
      metadata: JSON.stringify({ procesoId: parsed.data.procesoId, paginas: parsed.data.paginasEstimadas }),
    });

    return NextResponse.json({ jobId }, { status: 201 });
  } catch (error) {
    console.error("Error starting analysis:", error);
    return NextResponse.json(
      { error: "Error al iniciar analisis" },
      { status: 500 }
    );
  }
}
