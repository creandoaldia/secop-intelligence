import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { senaProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateCsrf, csrfErrorResponse } from "@/lib/security/csrf";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit/logger";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitMiddleware(`sena-delete:${session.user.id}`, { maxRequests: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }
  const csrf = validateCsrf(request);
  if (!csrf.valid) return csrfErrorResponse();

  try {
    const existing = await db
      .select()
      .from(senaProfiles)
      .where(and(eq(senaProfiles.id, parseInt(params.id)), eq(senaProfiles.userId, session.user.id)))
      .get();

    if (!existing) {
      return NextResponse.json(
        { error: "Perfil no encontrado" },
        { status: 404 }
      );
    }

    await db
      .delete(senaProfiles)
      .where(and(eq(senaProfiles.id, parseInt(params.id)), eq(senaProfiles.userId, session.user.id)))
      .run();

    await logAudit({
      action: "sena.delete",
      userId: session.user.id,
      entity: "sena_profile",
      entityId: params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting SENA profile:", error);
    return NextResponse.json(
      { error: "Error al eliminar perfil SENA" },
      { status: 500 }
    );
  }
}
