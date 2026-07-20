// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — LinkedIn OAuth Callback
// GET /api/linkedin/callback — handles OAuth redirect
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth, canUseFeature } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { exchangeCodeForToken, getProfile } from "@/lib/linkedin/client";
import { encrypt } from "@/lib/linkedin/encrypt";
import { logAudit } from "@/lib/audit/logger";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";

const cookiePrefix = process.env.NODE_ENV === "production" ? "__Secure-" : "";

function clearStateCookie(resp: NextResponse): void {
  resp.cookies.set(`${cookiePrefix}linkedin-oauth-state`, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/linkedin/callback",
    maxAge: 0,
  });
}

function redirectWithCleanup(url: string, request: NextRequest): NextResponse {
  const resp = NextResponse.redirect(new URL(url, request.url));
  clearStateCookie(resp);
  return resp;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    // Redirect to login if not authenticated
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    const resp = NextResponse.redirect(loginUrl);
    clearStateCookie(resp);
    return resp;
  }

  const { searchParams } = new URL(request.url);
  const queryState = searchParams.get("state");

  // CSRF: validate LinkedIn OAuth state against cookie
  const cookieState = request.cookies.get(`${cookiePrefix}linkedin-oauth-state`)?.value;
  if (queryState) {
    if (!cookieState) {
      return redirectWithCleanup("/perfil?error=state_expired", request);
    }
    if (cookieState !== queryState) {
      return redirectWithCleanup("/perfil?error=invalid_state", request);
    }
  }

  if (!canUseFeature(session.user.plan ?? "free", "linkedin")) {
    const resp = NextResponse.json({ error: "Plan no autorizado" }, { status: 403 });
    clearStateCookie(resp);
    return resp;
  }

  const rl = rateLimitMiddleware(`linkedin-callback:${session.user.id}`, {
    maxRequests: 5,
    windowMs: 3_600_000,
  });
  if (!rl.allowed) {
    return redirectWithCleanup("/perfil?error=rate_limited", request);
  }

  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Handle OAuth error (user denied)
  if (error) {
    console.warn(`[LinkedIn Callback] OAuth error: ${error}`);
    return redirectWithCleanup(
      `/perfil?error=linkedin_denied&reason=${encodeURIComponent(error)}`,
      request
    );
  }

  if (!code || !queryState) {
    return redirectWithCleanup("/perfil?error=missing_params", request);
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
    const successRedirect = new URL("/perfil", request.url);
    successRedirect.searchParams.set("linkedin", "connected");
    const resp = NextResponse.redirect(successRedirect);
    clearStateCookie(resp);
    return resp;
  } catch (caughtError) {
    const err = caughtError instanceof Error ? caughtError.message : String(caughtError);
    console.error("[LinkedIn Callback] Error:", err);
    return redirectWithCleanup(
      `/perfil?error=linkedin_failed&reason=${encodeURIComponent(err)}`,
      request
    );
  }
}
