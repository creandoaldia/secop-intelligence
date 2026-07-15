import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateCsrf, csrfErrorResponse } from "@/lib/security/csrf";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/audit/logger";

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitMiddleware(`linkedin-disconnect:${session.user.id}`, { maxRequests: 5, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }
  const csrf = validateCsrf(request);
  if (!csrf.valid) return csrfErrorResponse();

  try {
    await db
      .update(users)
      .set({
        linkedinAccessToken: null,
        linkedinTokenExpiresAt: null,
        linkedinProfileId: null,
      })
      .where(eq(users.id, session.user.id))
      .run();

    await logAudit({
      action: "linkedin.disconnect",
      userId: session.user.id,
      entity: "user",
      entityId: session.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting LinkedIn:", error);
    return NextResponse.json(
      { error: "Error al desconectar LinkedIn" },
      { status: 500 }
    );
  }
}
