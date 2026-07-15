// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — CSRF Protection
// Validates Origin/Referer headers for API routes
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  // Production origins added at deploy time
];

export function validateCsrf(request: NextRequest): { valid: boolean; reason?: string } {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // GET requests are safe (no side effects)
  if (request.method === "GET") {
    return { valid: true };
  }

  // Check Origin header first (more reliable)
  if (origin) {
    if (ALLOWED_ORIGINS.includes(origin)) {
      return { valid: true };
    }
    // Allow same-origin (no Origin header = same origin for same-site requests)
    return { valid: false, reason: `Origin not allowed: ${origin}` };
  }

  // Fallback to Referer if Origin is missing
  if (referer) {
    const isAllowed = ALLOWED_ORIGINS.some((allowed) => referer.startsWith(allowed));
    if (isAllowed) return { valid: true };
    return { valid: false, reason: `Referer not allowed: ${referer}` };
  }

  // No Origin and no Referer: allow for programmatic API calls (same-origin)
  // In production, this should be more strict
  return { valid: true };
}

export function csrfErrorResponse(): NextResponse {
  return NextResponse.json(
    { error: "CSRF validation failed" },
    { status: 403 }
  );
}
