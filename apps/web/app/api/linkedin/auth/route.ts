import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";
import { validateCsrf, csrfErrorResponse } from "@/lib/security/csrf";
import { logAudit } from "@/lib/audit/logger";
import { getAuthUrl, exchangeCodeForToken, getProfile } from "@/lib/linkedin/client";
import { encrypt } from "@/lib/linkedin/encrypt";

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitMiddleware(`linkedin-auth:${session.user.id}`, { maxRequests: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const state = crypto.randomUUID();
  const authUrl = getAuthUrl(state);

  return NextResponse.json(authUrl);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitMiddleware(`linkedin-token:${session.user.id}`, { maxRequests: 5, windowMs: 3600_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  }
  const csrf = validateCsrf(request);
  if (!csrf.valid) return csrfErrorResponse();

  try {
    const body = await request.json();
    const { code } = body;
    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Codigo de autorizacion requerido" }, { status: 400 });
    }

    const tokenData = await exchangeCodeForToken(code);
    const encryptedToken = encrypt(tokenData.accessToken);
    const profile = await getProfile(tokenData.accessToken);

    await db
      .update(users)
      .set({
        linkedinAccessToken: encryptedToken,
        linkedinTokenExpiresAt: new Date(tokenData.expiresAt * 1000),
        linkedinProfileId: profile.id,
      })
      .where(eq(users.id, session.user.id))
      .run();

    await logAudit({
      action: "linkedin.connect",
      userId: session.user.id,
      entity: "user",
      entityId: session.user.id,
      metadata: JSON.stringify({ linkedinProfileId: profile.id }),
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Error exchanging LinkedIn code:", error);
    return NextResponse.json(
      { error: "Error al conectar con LinkedIn" },
      { status: 500 }
    );
  }
}
