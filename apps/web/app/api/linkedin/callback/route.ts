// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — LinkedIn OAuth Callback
// GET /api/linkedin/callback — handles OAuth redirect
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { exchangeCodeForToken, getProfile } from "@/lib/linkedin/client";
import { encrypt } from "@/lib/linkedin/encrypt";
import { logAudit } from "@/lib/audit/logger";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    // Redirect to login if not authenticated
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const rl = rateLimitMiddleware(`linkedin-callback:${session.user.id}`, {
    maxRequests: 5,
    windowMs: 3_600_000,
  });
  if (!rl.allowed) {
    return NextResponse.redirect(
      new URL("/perfil?error=rate_limited", request.url)
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth error (user denied)
  if (error) {
    console.warn(`[LinkedIn Callback] OAuth error: ${error}`);
    return NextResponse.redirect(
      new URL(`/perfil?error=linkedin_denied&reason=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/perfil?error=missing_params", request.url)
    );
  }

  try {
    // Exchange code for token
    const tokenData = await exchangeCodeForToken(code);

    // Get LinkedIn profile
    const profile = await getProfile(tokenData.accessToken);

    // Encrypt and store token
    const encryptedToken = encrypt(tokenData.accessToken);

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
      metadata: JSON.stringify({
        linkedinProfileId: profile.id,
        linkedinName: profile.name,
      }),
    });

    // Redirect back to profile page with success
    const redirectUrl = new URL("/perfil", request.url);
    redirectUrl.searchParams.set("linkedin", "connected");
    return NextResponse.redirect(redirectUrl);
  } catch (caughtError) {
    const err = caughtError instanceof Error ? caughtError.message : String(caughtError);
    console.error("[LinkedIn Callback] Error:", err);
    return NextResponse.redirect(
      new URL(`/perfil?error=linkedin_failed&reason=${encodeURIComponent(err)}`, request.url)
    );
  }
}
